-- Community Butler — the Recruiter, B2B + Web Studio, and Analyst agents.
--
-- Run in the Supabase SQL editor after 004_agents.sql. Safe to re-run.
--
-- Same rule as 004: no browser writes to these tables directly. Admins add
-- prospects and mark how they responded through the two functions below,
-- which check is_admin() themselves.

-- ------------------------------------------------------------ task types

alter table public.agent_tasks drop constraint if exists agent_tasks_type_check;
alter table public.agent_tasks add constraint agent_tasks_type_check check (type in (
  'JOB_INTAKE','JOB_MATCH','MATCH_ESCALATE','LEAD_TRIAGE','JOB_FOLLOWUP',
  'SUPPLY_CHECK','B2B_OUTREACH','WEB_LEAD','WEB_BRIEF','WEEKLY_REVIEW','CONFIG_PROPOSAL'
));

-- 'system' tasks are about the roster or the week, not one row.
alter table public.agent_tasks drop constraint if exists agent_tasks_subject_type_check;
alter table public.agent_tasks add constraint agent_tasks_subject_type_check
  check (subject_type in ('job','lead','system'));

-- ------------------------------------------------------------- prospects

-- Businesses (b2b) and website inquiries (web) live alongside pasted posts.
-- Their contact details go in `details`: org, segment, contactName, email,
-- budget, website.
alter table public.leads add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.leads drop constraint if exists leads_channel_check;
alter table public.leads add constraint leads_channel_check
  check (channel in ('nextdoor','instagram','email','other','b2b','web'));

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new','contacted','replied','won','dropped'));

-- An admin adding a business to reach out to, or a website inquiry.
-- Creates the lead and its first task together.
create or replace function public.submit_prospect(
  p_kind text, p_org text, p_segment text, p_contact text, p_email text,
  p_town text, p_budget text, p_website text, p_notes text, p_author text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_kind not in ('b2b','web') then raise exception 'Pick business outreach or website inquiry'; end if;
  if coalesce(trim(p_org), '') = '' then raise exception 'Add the business name'; end if;

  insert into public.leads (channel, text, town, author, details, created_by)
  values (
    p_kind,
    left(coalesce(p_notes, ''), 4000),
    left(coalesce(p_town, ''), 80),
    left(coalesce(p_author, ''), 40),
    jsonb_strip_nulls(jsonb_build_object(
      'org', left(trim(p_org), 120),
      'segment', case when p_segment in ('realtor','property_manager','hoa','small_business') then p_segment else null end,
      'contactName', nullif(left(trim(coalesce(p_contact, '')), 80), ''),
      'email', nullif(left(lower(trim(coalesce(p_email, ''))), 160), ''),
      'budget', nullif(left(trim(coalesce(p_budget, '')), 20), ''),
      'website', nullif(left(trim(coalesce(p_website, '')), 200), '')
    )),
    auth.uid()
  )
  returning id into new_id;

  insert into public.agent_tasks (type, subject_type, subject_id, idempotency_key, priority)
  values (
    case p_kind when 'b2b' then 'B2B_OUTREACH' else 'WEB_LEAD' end,
    'lead', new_id::text,
    case p_kind when 'b2b' then 'lead:' || new_id || ':b2b:0' else 'lead:' || new_id || ':web' end,
    case p_kind when 'b2b' then 1 else 2 end
  );
  return new_id;
end;
$$;

revoke all on function public.submit_prospect(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_prospect(text,text,text,text,text,text,text,text,text,text) to authenticated;

-- An admin recording how a prospect responded. 'replied' stops follow-ups;
-- 'won' on a website inquiry makes the agent write the build brief.
create or replace function public.set_lead_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_status not in ('contacted','replied','won','dropped') then raise exception 'Unknown status'; end if;
  update public.leads set status = p_status where id = p_id;
  if not found then raise exception 'No such prospect'; end if;
end;
$$;

revoke all on function public.set_lead_status(uuid,text) from public, anon;
grant execute on function public.set_lead_status(uuid,text) to authenticated;
