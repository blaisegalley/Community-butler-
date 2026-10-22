-- Community Butler — the agent system's tables.
--
-- Run in the Supabase SQL editor after schema.sql and the earlier
-- migrations. Safe to re-run.
--
-- The rule this file exists to enforce: agents draft, humans publish.
-- No browser can write to any table here. The agent-dispatcher edge
-- function writes drafts with the service role, the agent-decide edge
-- function records an admin's decision and is the only thing that acts on
-- one, and admins can read everything. A stolen session cannot approve its
-- own card, because approving is not a table write a browser can make.

-- ---------------------------------------------------------------- tables

create table if not exists public.agent_tasks (
  id               uuid primary key default gen_random_uuid(),
  type             text not null
                     check (type in ('JOB_INTAKE','JOB_MATCH','MATCH_ESCALATE','LEAD_TRIAGE','JOB_FOLLOWUP')),
  -- A pointer to the job or lead, never a copy of the neighbour's details.
  subject_type     text not null check (subject_type in ('job','lead')),
  subject_id       text not null,
  -- The same event can never produce two cards: "job:<id>:intake" exists once.
  idempotency_key  text not null unique,
  state            text not null default 'queued'
                     check (state in ('queued','running','awaiting_approval','done','retry','dead_letter','closed','expired')),
  priority         int not null default 1,
  attempts         int not null default 0,
  draft            jsonb,
  -- Every admin decision on this card, in order: who, what, why, final text.
  decisions        jsonb not null default '[]'::jsonb,
  last_error       text not null default '',
  closed_reason    text not null default '',
  deadline         timestamptz,
  run_after        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists agent_tasks_due_idx on public.agent_tasks (state, run_after, priority desc);
create index if not exists agent_tasks_subject_idx on public.agent_tasks (subject_type, subject_id);

-- One row per model or template call. The cost ledger, and the first place
-- to look when a draft is strange.
create table if not exists public.agent_runs (
  id            bigserial primary key,
  task_id       uuid references public.agent_tasks(id) on delete cascade,
  agent         text not null,
  purpose       text not null default '',
  mode          text not null check (mode in ('model','template')),
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(10,5) not null default 0,
  error         text not null default '',
  at            timestamptz not null default now()
);

create index if not exists agent_runs_at_idx on public.agent_runs (at desc);

-- Posts an admin pasted in from Nextdoor, Instagram or email.
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null check (channel in ('nextdoor','instagram','email','other')),
  text        text not null,
  town        text not null default '',
  author      text not null default '',
  status      text not null default 'new' check (status in ('new','replied','dropped')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Policy overrides (towns, prices, weights, kill switches, budget). The
-- active row is merged over the defaults in _shared/agents/config.ts.
-- Rolling back is re-activating an older version.
create table if not exists public.agent_config (
  version     serial primary key,
  config      jsonb not null,
  active      boolean not null default false,
  note        text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists agent_config_one_active on public.agent_config (active) where active;

-- ------------------------------------------------------- row level security

alter table public.agent_tasks  enable row level security;
alter table public.agent_runs   enable row level security;
alter table public.leads        enable row level security;
alter table public.agent_config enable row level security;

drop policy if exists agent_tasks_select on public.agent_tasks;
create policy agent_tasks_select on public.agent_tasks for select to authenticated using (public.is_admin());

drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select to authenticated using (public.is_admin());

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated using (public.is_admin());

drop policy if exists agent_config_select on public.agent_config;
create policy agent_config_select on public.agent_config for select to authenticated using (public.is_admin());

-- No insert/update/delete policies at all. Writes come from the edge
-- functions (service role) or the two narrow functions below.

-- --------------------------------------------------------------- rpcs

-- An admin pasting a lead. Creates the lead and its triage task together,
-- so a lead can never exist without the agent being asked about it.
create or replace function public.submit_lead(
  p_channel text, p_text text, p_town text, p_author text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Paste the post first'; end if;

  insert into public.leads (channel, text, town, author, created_by)
  values (
    case when p_channel in ('nextdoor','instagram','email','other') then p_channel else 'other' end,
    left(p_text, 4000), left(coalesce(p_town, ''), 80), left(coalesce(p_author, ''), 40), auth.uid()
  )
  returning id into new_id;

  insert into public.agent_tasks (type, subject_type, subject_id, idempotency_key, priority)
  values ('LEAD_TRIAGE', 'lead', new_id::text, 'lead:' || new_id || ':triage', 2);

  return new_id;
end;
$$;

revoke all on function public.submit_lead(text,text,text,text) from public, anon;
grant execute on function public.submit_lead(text,text,text,text) to authenticated;

-- The dispatcher taking work. SKIP LOCKED means two overlapping runs (a
-- slow cron tick and an admin's "Run now") never take the same task. A
-- task stuck in 'running' for 15 minutes belonged to a run that died; it
-- goes back in the queue.
create or replace function public.claim_agent_tasks(p_limit int)
returns setof public.agent_tasks
language plpgsql security definer set search_path = public as $$
begin
  update public.agent_tasks
     set state = 'retry', last_error = 'Previous run did not finish', updated_at = now()
   where state = 'running' and updated_at < now() - interval '15 minutes';

  return query
  update public.agent_tasks t
     set state = 'running', attempts = t.attempts + 1, updated_at = now()
   where t.id in (
     select q.id from public.agent_tasks q
      where q.state in ('queued','retry') and q.run_after <= now()
      order by q.priority desc, q.created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked
   )
  returning t.*;
end;
$$;

revoke all on function public.claim_agent_tasks(int) from public, anon, authenticated;
grant execute on function public.claim_agent_tasks(int) to service_role;
