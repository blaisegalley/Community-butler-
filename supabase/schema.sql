-- Community Butler — database schema.
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is safe to re-run: every statement is guarded.
--
-- The thing to understand before changing anything here: a job row holds a
-- neighbour's name, home address and phone number. Row Level Security is
-- what stops that being readable by the whole internet, and the anon key
-- shipped in the browser is public by design. So no table below grants a
-- blanket read to anon, and anything a signed-out visitor needs to do goes
-- through a `security definer` function that does exactly one thing.

-- ---------------------------------------------------------------- tables

create table if not exists public.butlers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  name           text not null,
  contact        text not null,
  service_area   text not null default '',
  job_type_prefs text[] not null default '{}',
  signed_up_at   timestamptz not null default now()
);

create table if not exists public.admins (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null unique references auth.users(id) on delete cascade,
  email    text not null,
  added_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  service            text not null default '',
  name               text not null default '',
  phone              text not null default '',
  email              text not null default '',
  address            text not null default '',
  -- Comes from <input type="date">, so 'YYYY-MM-DD' or ''. Kept as text
  -- because it is optional and free-form-ish; the reminder job filters on
  -- the shape before casting.
  scheduled_for      text not null default '',
  budget             text not null default '',
  details            text not null default '',
  submitted_at       timestamptz not null default now(),
  status             text not null default 'New'
                       check (status in ('New','Approved','Assigned','Completed','Rejected')),
  reject_note        text not null default '',
  assigned_butler_id uuid references public.butlers(id) on delete set null,
  assigned_at        timestamptz,
  completed_at       timestamptz,
  accepted_by_self   boolean not null default false,
  rating             int check (rating between 1 and 5),
  -- Set when the corresponding email actually goes out, so a retry or a
  -- double-run of the scheduled job cannot send the same mail twice.
  confirmation_sent_at timestamptz,
  reminder_sent_at     timestamptz
);

create index if not exists jobs_open_idx
  on public.jobs (status) where assigned_butler_id is null;
create index if not exists jobs_butler_idx on public.jobs (assigned_butler_id);

create table if not exists public.butler_notifications (
  id        uuid primary key default gen_random_uuid(),
  butler_id uuid not null references public.butlers(id) on delete cascade,
  message   text not null,
  at        timestamptz not null default now(),
  read      boolean not null default false
);

create index if not exists butler_notifications_butler_idx
  on public.butler_notifications (butler_id, at desc);

create table if not exists public.activity (
  id      uuid primary key default gen_random_uuid(),
  message text not null,
  at      timestamptz not null default now()
);

-- One row per browser that agreed to receive notifications. A butler's
-- subscription is tied to their account; a neighbour has no account, so
-- theirs is tied to the single job they posted and dies with it.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  butler_id  uuid references public.butlers(id) on delete cascade,
  job_id     uuid references public.jobs(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_owner
    check ((butler_id is null) <> (job_id is null))
);

create index if not exists push_subscriptions_butler_idx
  on public.push_subscriptions (butler_id);
create index if not exists push_subscriptions_job_idx
  on public.push_subscriptions (job_id);

-- ------------------------------------------------------------- helpers

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create or replace function public.current_butler_id()
returns uuid language sql stable security definer set search_path = public as $$
  select b.id from public.butlers b where b.user_id = auth.uid();
$$;

create or replace function public.log_activity(p_message text)
returns void language sql security definer set search_path = public as $$
  insert into public.activity (message) values (p_message);
$$;

-- ------------------------------------------------------- row level security

alter table public.butlers              enable row level security;
alter table public.admins               enable row level security;
alter table public.jobs                 enable row level security;
alter table public.butler_notifications enable row level security;
alter table public.activity             enable row level security;
alter table public.push_subscriptions   enable row level security;

drop policy if exists butlers_select on public.butlers;
create policy butlers_select on public.butlers for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- A butler creates their own row straight after signing up, and can only
-- create one pointing at themselves.
drop policy if exists butlers_insert on public.butlers;
create policy butlers_insert on public.butlers for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists butlers_update on public.butlers;
create policy butlers_update on public.butlers for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select to authenticated
  using (public.is_admin());
-- No insert/update/delete policy: only the service role (the invite edge
-- function) may add an admin. A compromised browser session cannot.

-- Job rows carry home addresses, so nobody signed out may read them, and a
-- butler sees only what they could act on.
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs for select to authenticated
  using (
    public.is_admin()
    or (status = 'Approved' and assigned_butler_id is null)
    or assigned_butler_id = public.current_butler_id()
  );

drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists jobs_delete on public.jobs;
create policy jobs_delete on public.jobs for delete to authenticated
  using (public.is_admin());
-- No insert policy either: posting goes through post_job() below, so a
-- caller cannot hand themselves an already-approved job.

drop policy if exists notifications_select on public.butler_notifications;
create policy notifications_select on public.butler_notifications for select to authenticated
  using (public.is_admin() or butler_id = public.current_butler_id());

drop policy if exists notifications_update on public.butler_notifications;
create policy notifications_update on public.butler_notifications for update to authenticated
  using (butler_id = public.current_butler_id())
  with check (butler_id = public.current_butler_id());

drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select to authenticated
  using (public.is_admin());

drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated
  using (butler_id = public.current_butler_id());

drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert to authenticated
  with check (butler_id = public.current_butler_id());

drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (butler_id = public.current_butler_id());

-- --------------------------------------------------------------- rpcs
--
-- Each of these is `security definer`, so it runs with the table owner's
-- rights and bypasses RLS. That is the point: they are the narrow doors
-- through which a caller can do one specific thing they otherwise cannot.
-- Keep them narrow.

-- Posting a job. Signed-out neighbours call this. It always creates a
-- 'New', unassigned job — the caller cannot choose a status — and returns
-- only the new id, never a readable row.
create or replace function public.post_job(
  p_service text, p_name text, p_phone text, p_email text,
  p_address text, p_scheduled_for text, p_budget text, p_details text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into public.jobs (service, name, phone, email, address, scheduled_for, budget, details)
  values (
    coalesce(p_service,''), coalesce(p_name,''), coalesce(p_phone,''),
    coalesce(p_email,''), coalesce(p_address,''), coalesce(p_scheduled_for,''),
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

-- Lets the neighbour who just posted a job turn on notifications for it
-- without an account. They can only reach a job whose id they were just
-- handed, and a subscription grants no read access to anything.
create or replace function public.subscribe_to_job(
  p_job_id uuid, p_endpoint text, p_p256dh text, p_auth text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.jobs j where j.id = p_job_id) then
    raise exception 'unknown job';
  end if;

  insert into public.push_subscriptions (job_id, endpoint, p256dh, auth)
  values (p_job_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set job_id = excluded.job_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- A butler claiming an open job. The WHERE clause is the lock: two
-- butlers tapping at the same instant both run this, and exactly one
-- updates a row. The loser gets false and a clear message, rather than
-- silently overwriting the winner.
create or replace function public.accept_job(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; claimed int; svc text; who text;
begin
  me := public.current_butler_id();
  if me is null then raise exception 'not a butler'; end if;

  update public.jobs
     set status = 'Assigned', assigned_butler_id = me,
         assigned_at = now(), accepted_by_self = true
   where id = p_job_id and status = 'Approved' and assigned_butler_id is null;

  get diagnostics claimed = row_count;
  if claimed = 0 then return false; end if;

  select coalesce(nullif(j.service,''),'a job') into svc from public.jobs j where j.id = p_job_id;
  select b.name into who from public.butlers b where b.id = me;
  perform public.log_activity(who || ' accepted ' || svc);
  return true;
end;
$$;

revoke all on function public.post_job(text,text,text,text,text,text,text,text) from public;
grant execute on function public.post_job(text,text,text,text,text,text,text,text) to anon, authenticated;

revoke all on function public.subscribe_to_job(uuid,text,text,text) from public;
grant execute on function public.subscribe_to_job(uuid,text,text,text) to anon, authenticated;

revoke all on function public.accept_job(uuid) from public;
grant execute on function public.accept_job(uuid) to authenticated;

-- log_activity is called by the functions above, which already run as the
-- owner, so no client ever needs to call it directly.
revoke all on function public.log_activity(text) from public, anon, authenticated;

-- ------------------------------------------------------------ triggers
--
-- The activity feed is written by the database, not by the client. Admin
-- actions are ordinary UPDATEs against jobs, and a client-side log line is
-- something a future edit can silently drop. A trigger cannot be forgotten.

create or replace function public.jobs_activity_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.status is distinct from old.status then
    select b.name into who from public.butlers b where b.id = new.assigned_butler_id;

    if new.status = 'Approved' then
      perform public.log_activity(
        'Approved job: ' || coalesce(nullif(new.service,''),'Job') || ' for ' || new.name);
    elsif new.status = 'Rejected' then
      perform public.log_activity(
        'Rejected job: ' || coalesce(nullif(new.service,''),'Job') || ' for ' || new.name);
    elsif new.status = 'Assigned' and not new.accepted_by_self then
      -- accept_job() writes its own, more specific line.
      perform public.log_activity(
        'Assigned ' || coalesce(nullif(new.service,''),'job') || ' to ' || coalesce(who,'a Butler'));
    elsif new.status = 'Completed' then
      perform public.log_activity(
        'Completed job: ' || coalesce(nullif(new.service,''),'Job')
        || coalesce(' by ' || who, '')
        || coalesce(' — rated ' || new.rating || '★', ''));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_activity on public.jobs;
create trigger jobs_activity after update on public.jobs
  for each row execute function public.jobs_activity_trigger();

create or replace function public.butlers_activity_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.name || ' signed up as a Butler');
  return new;
end;
$$;

drop trigger if exists butlers_activity on public.butlers;
create trigger butlers_activity after insert on public.butlers
  for each row execute function public.butlers_activity_trigger();
