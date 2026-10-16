/*
 * The hosted runtime for the agents: Postgres-backed storage for the
 * dispatcher, and the Executor that turns an approved card into a real
 * effect (a job status change, an email, a GroupMe post).
 *
 * Everything here runs with the service role, so it trusts nothing it was
 * not given by the dispatcher or by an admin-authenticated request.
 */
import type { SupabaseClient } from './deps.ts';
import {
  AGENT_JOB_COLUMNS,
  approvedTexts,
  butlerStats,
  jobFromRow,
  leadFromRow,
  mergeConfig,
  taskFromRow,
  taskUpdate,
  TASK_COLUMNS,
} from './agents/index.ts';
import type {
  Action,
  AgentButler,
  AgentConfig,
  AgentJob,
  AgentTask,
  DispatcherIO,
  JobRowForAgents,
  LeadRow,
  Llm,
  TaskRow,
} from './agents/index.ts';
import { sendEmail } from './email.ts';

function check<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function loadAgentConfig(db: SupabaseClient): Promise<AgentConfig> {
  const { data } = await db.from('agent_config').select('config').eq('active', true).maybeSingle();
  const config = mergeConfig((data?.config as Partial<AgentConfig>) ?? null);
  const model = Deno.env.get('AGENT_MODEL');
  return model ? { ...config, model } : config;
}

async function loadJobs(db: SupabaseClient): Promise<AgentJob[]> {
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const rows = check(
    await db.from('jobs').select(AGENT_JOB_COLUMNS).gte('submitted_at', since).order('submitted_at', { ascending: false }).limit(2000),
    'Could not load jobs',
  ) as JobRowForAgents[];
  return rows.map(jobFromRow);
}

function toTasks(result: { data: unknown; error: { message: string } | null }): AgentTask[] {
  return ((check(result, 'Could not load agent tasks') as TaskRow[] | null) ?? []).map(taskFromRow);
}

export function remoteIO(db: SupabaseClient, llm: Llm | null, config: AgentConfig): DispatcherIO {
  let jobsCache: AgentJob[] | null = null;
  const jobs = async () => (jobsCache ??= await loadJobs(db));

  return {
    now: () => new Date(),
    llm,
    config,
    loadJobs: jobs,

    async loadButlers(): Promise<AgentButler[]> {
      const rows = check(
        await db.from('butlers').select('id,name,service_area,job_type_prefs,intake,profile_status'),
        'Could not load butlers',
      ) as { id: string; name: string; service_area: string; job_type_prefs: string[]; intake: { grade?: string } | null; profile_status: string }[];
      const all = await jobs();
      const now = new Date();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        serviceArea: row.service_area ?? '',
        jobTypePrefs: row.job_type_prefs ?? [],
        grade: row.intake?.grade ?? '',
        approved: row.profile_status === 'Approved',
        stats: butlerStats(row.id, all, now),
      }));
    },

    async loadLead(id) {
      const { data } = await db.from('leads').select('id,channel,text,town,author,status,created_at').eq('id', id).maybeSingle();
      return data ? leadFromRow(data as LeadRow) : null;
    },

    async taskIndex() {
      const since = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
      const rows = check(await db.from('agent_tasks').select('idempotency_key,created_at,state').gte('created_at', since), 'Could not load task index') as {
        idempotency_key: string; created_at: string; state: string;
      }[];
      return new Map(rows.map((r) => [r.idempotency_key, { createdAt: r.created_at, state: r.state }]));
    },

    async insertTasks(tasks) {
      const rows = tasks.map((t) => ({ type: t.type, subject_type: t.subjectType, subject_id: t.subjectId, idempotency_key: t.idempotencyKey, priority: t.priority }));
      // ignoreDuplicates: a concurrent run that planned the same task is not an error.
      check(await db.from('agent_tasks').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true }), 'Could not queue tasks');
    },

    async claimTasks(limit) {
      const rows = check(await db.rpc('claim_agent_tasks', { p_limit: limit }), 'Could not claim tasks') as TaskRow[];
      return (rows ?? []).map(taskFromRow);
    },

    async saveTask(task) {
      check(await db.from('agent_tasks').update(taskUpdate(task)).eq('id', task.id), 'Could not save task');
    },

    awaitingTasks: async () =>
      toTasks(await db.from('agent_tasks').select(TASK_COLUMNS).eq('state', 'awaiting_approval').lt('deadline', new Date().toISOString())),

    async intakeSafety(jobId) {
      const { data } = await db.from('agent_tasks').select('draft').eq('idempotency_key', `job:${jobId}:intake`).maybeSingle();
      return (data?.draft as AgentTask['draft'])?.safety ?? null;
    },

    async examples(agent) {
      const tasks = toTasks(
        await db.from('agent_tasks').select(TASK_COLUMNS).eq('state', 'done').eq('draft->>agent', agent).order('updated_at', { ascending: false }).limit(30),
      );
      return approvedTexts(tasks).slice(0, 5);
    },

    async postedReplies() {
      const tasks = toTasks(
        await db.from('agent_tasks').select(TASK_COLUMNS).eq('state', 'done').eq('type', 'LEAD_TRIAGE').order('updated_at', { ascending: false }).limit(20),
      );
      return approvedTexts(tasks);
    },

    async setLeadStatus(id, status) {
      await db.from('leads').update({ status }).eq('id', id);
    },

    async logRuns(runs) {
      const { error } = await db.from('agent_runs').insert(
        runs.map((r) => ({ task_id: r.taskId, agent: r.agent, purpose: r.purpose, mode: r.mode, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd, error: r.error.slice(0, 500), at: r.at })),
      );
      if (error) console.error('Could not log agent runs:', error.message);
    },

    async monthSpendUsd() {
      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      const rows = check(await db.from('agent_runs').select('cost_usd').gte('at', start.toISOString()).eq('mode', 'model'), 'Could not read spend') as { cost_usd: number }[];
      return rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
    },
  };
}

export async function loadTask(db: SupabaseClient, id: string): Promise<AgentTask | null> {
  const { data, error } = await db.from('agent_tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? taskFromRow(data as TaskRow) : null;
}

export async function saveTask(db: SupabaseClient, task: AgentTask): Promise<void> {
  check(await db.from('agent_tasks').update(taskUpdate(task)).eq('id', task.id), 'Could not save task');
}

// ------------------------------------------------------------------ executor

export interface ExecutionResult {
  ok: boolean;
  /** Shown on the card. Says plainly when something must be done by hand. */
  detail: string;
}

/** Calls one of the existing notification functions as the admin who approved. */
async function callFunction(name: string, body: unknown, authorization: string): Promise<boolean> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`;
  try {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) console.error(`${name} returned ${response.status}: ${await response.text()}`);
    return response.ok;
  } catch (cause) {
    console.error(`${name} failed:`, (cause as Error).message);
    return false;
  }
}

function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n|\n/).map((line) => line.trim()).filter(Boolean);
}

async function emailNeighbor(job: { email: string; name: string }, subject: string, text: string, config: AgentConfig): Promise<ExecutionResult> {
  if (!job.email) return { ok: true, detail: `No email on file for ${job.name} — call or text them with this message instead.` };
  const sent = await sendEmail({ to: job.email, subject, heading: subject, lines: paragraphs(text), footnote: `${config.businessName} · ${config.businessPhone}` });
  return sent
    ? { ok: true, detail: `Emailed ${job.email}` }
    : { ok: true, detail: `Email isn't set up or was rejected — send this to ${job.email} yourself.` };
}

/**
 * Performs an approved action. Status changes guard on the current status,
 * so approving a stale card (the job was handled in the Job requests tab
 * meanwhile) changes nothing and says so.
 */
export async function execute(
  db: SupabaseClient,
  action: Action,
  text: string,
  config: AgentConfig,
  authorization: string,
): Promise<ExecutionResult> {
  switch (action.kind) {
    case 'approve_job': {
      const { data } = await db.from('jobs').update({ status: 'Approved' }).eq('id', action.jobId).eq('status', 'New').select('id');
      if (!data?.length) return { ok: false, detail: 'This job is no longer New — it was handled elsewhere.' };
      const notified = await callFunction('notify-butlers', { jobId: action.jobId }, authorization);
      return { ok: true, detail: notified ? 'Job approved and Butlers notified.' : 'Job approved. Butler notifications did not go out.' };
    }

    case 'decline_job': {
      const { data } = await db.from('jobs').update({ status: 'Rejected', reject_note: action.note.slice(0, 500) }).eq('id', action.jobId).eq('status', 'New').select('id,email,name');
      if (!data?.length) return { ok: false, detail: 'This job is no longer New — it was handled elsewhere.' };
      if (!action.notifyNeighbor || !text) return { ok: true, detail: 'Job closed.' };
      const result = await emailNeighbor(data[0], `About your ${config.businessName} request`, text, config);
      return { ok: true, detail: `Job closed. ${result.detail}` };
    }

    case 'message_neighbor': {
      const { data: job } = await db.from('jobs').select('email,name').eq('id', action.jobId).maybeSingle();
      if (!job) return { ok: false, detail: 'That job no longer exists.' };
      return emailNeighbor(job, action.subject, text, config);
    }

    case 'assign_butler': {
      const [primary, ...others] = action.butlerIds;
      const { data } = await db
        .from('jobs')
        .update({ status: 'Assigned', assigned_butler_id: primary, assigned_at: new Date().toISOString(), accepted_by_self: false })
        .eq('id', action.jobId)
        .eq('status', 'Approved')
        .is('assigned_butler_id', null)
        .select('id');
      if (!data?.length) return { ok: false, detail: 'Someone already has this job, or it is no longer open.' };
      await db.from('butler_notifications').insert(action.butlerIds.map((id) => ({ butler_id: id, message: text.slice(0, 500) })));
      const confirmed = await callFunction('job-confirmed', { jobId: action.jobId }, authorization);
      return {
        ok: true,
        detail: `Assigned.${others.length ? ' The second Butler was notified; the app records one assignee, so note the pairing in GroupMe.' : ''}${confirmed ? ' Neighbor confirmation sent.' : ''}`,
      };
    }

    case 'post_groupme': {
      const botId = Deno.env.get('GROUPME_BOT_ID');
      if (!botId) return { ok: true, detail: "GroupMe bot isn't set up — paste this into the group yourself." };
      const response = await fetch('https://api.groupme.com/v3/bots/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_id: botId, text: text.slice(0, 1000) }),
      });
      return response.ok
        ? { ok: true, detail: 'Posted to GroupMe.' }
        : { ok: false, detail: `GroupMe rejected the post (${response.status}). Try again or paste it yourself.` };
    }

    case 'mark_posted': {
      await db.from('leads').update({ status: 'replied' }).eq('id', action.leadId);
      return { ok: true, detail: 'Marked as posted.' };
    }

    case 'acknowledge':
      return { ok: true, detail: 'Acknowledged.' };
  }
}
