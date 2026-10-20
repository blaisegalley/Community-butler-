-- Community Butler — the daily reminder schedule.
--
-- Run this AFTER schema.sql and after deploying the edge functions.
--
-- Replace the two placeholders first:
--   <PROJECT-REF>  your project ref, e.g. abcdefghijklmnop
--                  (Supabase → Project Settings → General)
--   <CRON-SECRET>  the same value you set as the CRON_SECRET edge
--                  function secret. It is what proves to send-reminders
--                  that the request really came from this schedule.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Re-running this file replaces the schedule rather than adding a second
-- one, which would send every reminder twice.
select cron.unschedule('community-butler-daily-reminders')
where exists (
  select 1 from cron.job where jobname = 'community-butler-daily-reminders'
);

-- 15:00 UTC — mid-morning in Illinois year round. The function works out
-- which jobs are "tomorrow" in APP_TIMEZONE, so the exact hour only
-- decides when the reminder lands, not which day it covers.
select cron.schedule(
  'community-butler-daily-reminders',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON-SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Check it landed:
--   select jobname, schedule, active from cron.job;
-- And see what happened on recent runs:
--   select * from cron.job_run_details order by start_time desc limit 10;

-- ------------------------------------------------------------ agents
--
-- The agent dispatcher, every 5 minutes. It only drafts: new job requests
-- become approval cards, approved jobs get a matching card, and so on.
-- Nothing reaches a neighbour or a student until an admin approves the
-- card in /admin -> Approvals. Run this after migrations/004_agents.sql
-- and after deploying the agent-dispatcher function. Same placeholders
-- as above.

select cron.unschedule('community-butler-agents')
where exists (
  select 1 from cron.job where jobname = 'community-butler-agents'
);

select cron.schedule(
  'community-butler-agents',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/agent-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON-SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
