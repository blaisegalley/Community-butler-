-- Community Butler — a start time on jobs, and the 1-hour reminder.
--
-- Run in the Supabase SQL editor after 006. Safe to re-run.
--
-- Jobs only ever had a date, which is enough to say "tomorrow" but not
-- "in an hour". This adds the time, a marker for the second reminder, and
-- re-arms both reminders whenever a job is moved to a different slot.

alter table public.jobs add column if not exists scheduled_time text not null default '';
alter table public.jobs add column if not exists hour_reminder_sent_at timestamptz;

-- Neighbours can now give a time when they post. The old eight-argument
-- version is replaced rather than overloaded: two versions would leave
-- PostgREST unable to tell which one a request meant. The new argument has
-- a default, so a page that does not send it still works.
drop function if exists public.post_job(text,text,text,text,text,text,text,text);

create or replace function public.post_job(
  p_service text, p_name text, p_phone text, p_email text,
  p_address text, p_scheduled_for text, p_budget text, p_details text,
  p_scheduled_time text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into public.jobs (service, name, phone, email, address, scheduled_for, scheduled_time, budget, details)
  values (
    coalesce(p_service,''), coalesce(p_name,''), coalesce(p_phone,''),
    coalesce(p_email,''), coalesce(p_address,''), coalesce(p_scheduled_for,''),
    -- Only a well-formed HH:MM is kept; anything else is dropped rather
    -- than stored where the reminder job would trip over it.
    case when coalesce(p_scheduled_time,'') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then p_scheduled_time else '' end,
    coalesce(p_budget,''), coalesce(p_details,'')
  )
  returning id into new_id;

  perform public.log_activity(
    'New job request: ' || coalesce(nullif(p_service,''),'Job') ||
    ' from ' || coalesce(nullif(p_name,''),'a neighbor')
  );
  return new_id;
end;
$$;

revoke all on function public.post_job(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.post_job(text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- A job moved to a new date or time should be reminded about again at the
-- new slot, not skipped because the old slot's reminder already went out.
create or replace function public.jobs_rearm_reminders()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.scheduled_for is distinct from old.scheduled_for
     or new.scheduled_time is distinct from old.scheduled_time then
    new.reminder_sent_at := null;
    new.hour_reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_rearm_reminders on public.jobs;
create trigger jobs_rearm_reminders before update on public.jobs
  for each row execute function public.jobs_rearm_reminders();

notify pgrst, 'reload schema';

select 'jobs.scheduled_time' as check,
       case when count(*) = 1 then 'OK' else 'MISSING' end as result
  from information_schema.columns
 where table_schema = 'public' and table_name = 'jobs' and column_name = 'scheduled_time'
union all
select 'post_job(9 args)',
       case when count(*) = 1 then 'OK' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'post_job' and p.pronargs = 9;
