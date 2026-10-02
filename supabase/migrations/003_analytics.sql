-- Community Butler — page view tracking, for the metrics dashboard.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- What this deliberately does NOT record: no IP address, no cookie, no
-- user agent, no user id, no session id. A row says "someone looked at
-- this page at this time, and they were signed in as a butler or they
-- weren't". That is enough to answer the questions a dashboard should
-- answer, and it means the table cannot be turned into a record of what
-- any particular neighbour or student was doing.

create table if not exists public.page_views (
  id            bigserial primary key,
  path          text not null,
  -- Coarse on purpose. 'butler' means a signed-in butler; everyone else
  -- is 'visitor'. No finer than that.
  viewer        text not null default 'visitor'
                  check (viewer in ('visitor', 'butler', 'admin')),
  -- Host only — 'google.com', not the full URL with its query string,
  -- which can carry a search term someone typed.
  referrer_host text not null default '',
  at            timestamptz not null default now()
);

create index if not exists page_views_at_idx on public.page_views (at desc);
create index if not exists page_views_path_idx on public.page_views (path, at desc);

alter table public.page_views enable row level security;

-- Only admins read it. There is no insert policy: writes go through
-- record_page_view() below, so a caller cannot backdate a row, forge a
-- viewer kind, or write anything the function does not sanitise.
drop policy if exists page_views_select on public.page_views;
create policy page_views_select on public.page_views for select to authenticated
  using (public.is_admin());

create or replace function public.record_page_view(
  p_path text,
  p_referrer_host text
) returns void
language plpgsql security definer set search_path = public as $$
declare kind text := 'visitor';
begin
  -- The caller does not get to say who they are; it is derived from the
  -- token they presented.
  if auth.uid() is not null then
    if public.is_admin() then
      kind := 'admin';
    elsif public.current_butler_id() is not null then
      kind := 'butler';
    end if;
  end if;

  insert into public.page_views (path, viewer, referrer_host)
  values (
    -- Path only, truncated, query string and fragment dropped — those
    -- are where personal data leaks into analytics.
    left(split_part(split_part(coalesce(p_path, '/'), '?', 1), '#', 1), 120),
    kind,
    left(coalesce(p_referrer_host, ''), 120)
  );
end;
$$;

revoke all on function public.record_page_view(text, text) from public;
grant execute on function public.record_page_view(text, text) to anon, authenticated;

-- Admin-only rollups. Doing the grouping in SQL keeps the dashboard from
-- pulling every raw row into a browser just to count them — which would
-- also mean shipping the full view log to the client.
create or replace function public.views_by_day(p_days int default 30)
returns table (day date, viewer text, views bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('day', v.at)::date, v.viewer, count(*)
  from public.page_views v
  where public.is_admin()
    and v.at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1, 2
  order by 1;
$$;

create or replace function public.views_by_path(p_days int default 30)
returns table (path text, viewer text, views bigint)
language sql stable security definer set search_path = public as $$
  select v.path, v.viewer, count(*)
  from public.page_views v
  where public.is_admin()
    and v.at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1, 2
  order by 3 desc;
$$;

revoke all on function public.views_by_day(int) from public;
revoke all on function public.views_by_path(int) from public;
grant execute on function public.views_by_day(int) to authenticated;
grant execute on function public.views_by_path(int) to authenticated;

-- ------------------------------------------------------------- verify

select 'page_views table' as check,
       case when count(*) = 1 then 'OK' else 'MISSING' end as result
  from information_schema.tables
 where table_schema = 'public' and table_name = 'page_views'
union all
select 'record_page_view()',
       case when count(*) = 1 then 'OK' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'record_page_view'
union all
select 'views_by_day()',
       case when count(*) = 1 then 'OK' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'views_by_day'
union all
select 'views_by_path()',
       case when count(*) = 1 then 'OK' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'views_by_path';

notify pgrst, 'reload schema';
