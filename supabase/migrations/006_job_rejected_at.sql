-- Community Butler — record when a job was rejected.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- The admin page hides a rejected job an hour after it was rejected, so the
-- request list does not fill up with turned-down work. The row itself is
-- kept: the dashboard's numbers and the activity log still count it.

alter table public.jobs add column if not exists rejected_at timestamptz;

-- Stamped by the database rather than sent by the browser, so the time is
-- right whichever device rejected the job, and nothing in the app has to
-- change if this migration is run late.
create or replace function public.jobs_stamp_rejected_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'Rejected' and old.status is distinct from 'Rejected' then
    new.rejected_at := now();
  elsif new.status <> 'Rejected' then
    new.rejected_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_stamp_rejected_at on public.jobs;
create trigger jobs_stamp_rejected_at before update on public.jobs
  for each row execute function public.jobs_stamp_rejected_at();

-- Jobs rejected before this ran have no time on them. Treat them as long
-- since rejected, so they drop off the list straight away.
update public.jobs
   set rejected_at = submitted_at
 where status = 'Rejected' and rejected_at is null;

notify pgrst, 'reload schema';

select 'jobs.rejected_at' as check,
       case when count(*) = 1 then 'OK' else 'MISSING' end as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'jobs' and column_name = 'rejected_at';
