/*
 * The agents in demo mode: the same dispatcher and agents the edge
 * function runs, with this browser's localStorage underneath.
 *
 * There is no model here — an API key must never ship to a browser — so
 * every draft comes from the templates. And there is no server to send
 * mail or post to GroupMe, so the Executor changes job statuses for real
 * and tells the admin plainly to send any message themselves.
 */
import {
  applyDecision,
  approvedTexts,
  butlerStats,
  finishExecution,
  leadStatusAdvances,
  mergeConfig,
  newTaskRow,
  runDispatcher,
} from '@agents/index.ts';
import type { AgentButler, AgentConfig, AgentJob, AgentRun, AgentTask, DecisionInput, DispatcherIO, Lead, RunSummary } from '@agents/index.ts';
import { approveJob, assignJob, getAdminSession, getButlers, getJobs, rejectJob } from '@/lib/store';

const KEYS = {
  tasks: 'cb.agentTasks.v1',
  leads: 'cb.leads.v1',
  runs: 'cb.agentRuns.v1',
  // Approved Analyst proposals, merged over the defaults like agent_config on the server.
  config: 'cb.agentConfig.v1',
  // The demo backend's own butler list; notify_butlers appends to it.
  butlers: 'cb.butlers.v1',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the run still returns its summary */
  }
}

const tasks = () => read<AgentTask[]>(KEYS.tasks, []);
// Leads saved before prospects existed have no `details`.
const leads = () => read<Lead[]>(KEYS.leads, []).map((l) => ({ ...l, details: l.details ?? {} }));
const localConfig = (): AgentConfig => mergeConfig(read<Partial<AgentConfig> | null>(KEYS.config, null));

function saveTask(task: AgentTask): void {
  const all = tasks();
  const index = all.findIndex((t) => t.id === task.id);
  if (index > -1) all[index] = task;
  else all.push(task);
  write(KEYS.tasks, all);
}

async function agentJobs(): Promise<AgentJob[]> {
  return (await getJobs()).map((job) => ({
    id: job.id,
    service: job.service,
    name: job.name,
    phone: job.phone,
    email: job.email,
    address: job.address,
    date: job.date,
    budget: job.budget,
    details: job.details,
    submittedAt: job.submittedAt,
    status: job.status,
    assignedButlerId: job.assignedButlerId,
    assignedAt: job.assignedAt,
    completedAt: job.completedAt,
    ...(job.rating ? { rating: job.rating } : {}),
    ...(job.rejectNote ? { rejectNote: job.rejectNote } : {}),
  }));
}

function localIO(): DispatcherIO {
  const now = () => new Date();
  return {
    now,
    llm: null,
    config: localConfig(),
    loadJobs: agentJobs,
    async loadButlers(): Promise<AgentButler[]> {
      const [butlers, jobs] = await Promise.all([getButlers(), agentJobs()]);
      // Demo butlers have no reviewed profile or grade; treat them as approved.
      return butlers.map((b) => ({
        id: b.id, name: b.name, serviceArea: b.serviceArea, jobTypePrefs: b.jobTypePrefs, grade: '', approved: true,
        profileStatus: '', signedUpAt: b.signedUpAt, stats: butlerStats(b.id, jobs, now()),
      }));
    },
    loadLead: async (id) => leads().find((l) => l.id === id) ?? null,
    taskIndex: async () => new Map(tasks().map((t) => [t.idempotencyKey, { createdAt: t.createdAt, state: t.state }])),
    async insertTasks(list) {
      const all = tasks();
      for (const task of list) {
        if (!all.some((t) => t.idempotencyKey === task.idempotencyKey)) all.push(newTaskRow(task, crypto.randomUUID(), now()));
      }
      write(KEYS.tasks, all);
    },
    async claimTasks(limit) {
      const all = tasks();
      const due = all
        .filter((t) => (t.state === 'queued' || t.state === 'retry') && +new Date(t.runAfter) <= +now())
        .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
      for (const task of due) Object.assign(task, { state: 'running', attempts: task.attempts + 1, updatedAt: now().toISOString() });
      write(KEYS.tasks, all);
      return due.map((t) => ({ ...t }));
    },
    saveTask: async (task) => saveTask(task),
    awaitingTasks: async () => tasks().filter((t) => t.state === 'awaiting_approval'),
    intakeSafety: async (jobId) => tasks().find((t) => t.idempotencyKey === `job:${jobId}:intake`)?.draft?.safety ?? null,
    examples: async (agent) => approvedTexts(tasks().filter((t) => t.state === 'done' && t.draft?.agent === agent)).slice(0, 5),
    postedReplies: async () => approvedTexts(tasks().filter((t) => t.state === 'done' && t.type === 'LEAD_TRIAGE')),
    async setLeadStatus(id, status) {
      write(KEYS.leads, leads().map((l) => (l.id === id ? { ...l, status } : l)));
    },
    async logRuns(runs: AgentRun[]) {
      write(KEYS.runs, [...runs, ...read<AgentRun[]>(KEYS.runs, [])].slice(0, 500));
    },
    monthSpendUsd: async () => 0,
    loadLeads: async () => leads(),
    recentTasks: async (days) => tasks().filter((t) => +now() - +new Date(t.updatedAt) <= days * 86400000),
    recentRuns: async (days) => read<AgentRun[]>(KEYS.runs, []).filter((r) => +now() - +new Date(r.at) <= days * 86400000),
  };
}

export const runLocalAgents = (): Promise<RunSummary> => runDispatcher(localIO());

export const localTasks = (): AgentTask[] => tasks();

export const localLeads = (): Lead[] => leads();

export async function submitLocalLead(input: Pick<Lead, 'channel' | 'text' | 'town' | 'author'>): Promise<void> {
  const lead: Lead = { ...input, id: crypto.randomUUID(), status: 'new', details: {}, createdAt: new Date().toISOString() };
  write(KEYS.leads, [...leads(), lead]);
  saveTask(newTaskRow({ type: 'LEAD_TRIAGE', subjectType: 'lead', subjectId: lead.id, idempotencyKey: `lead:${lead.id}:triage`, priority: 2 }, crypto.randomUUID(), new Date()));
}

export async function submitLocalProspect(input: Pick<Lead, 'text' | 'town' | 'author' | 'details'> & { kind: 'b2b' | 'web' }): Promise<void> {
  const { kind, ...rest } = input;
  const lead: Lead = { ...rest, channel: kind, id: crypto.randomUUID(), status: 'new', createdAt: new Date().toISOString() };
  write(KEYS.leads, [...leads(), lead]);
  const key = kind === 'b2b' ? `lead:${lead.id}:b2b:0` : `lead:${lead.id}:web`;
  saveTask(newTaskRow({ type: kind === 'b2b' ? 'B2B_OUTREACH' : 'WEB_LEAD', subjectType: 'lead', subjectId: lead.id, idempotencyKey: key, priority: kind === 'b2b' ? 1 : 2 }, crypto.randomUUID(), new Date()));
}

export function setLocalLeadStatus(id: string, status: Lead['status']): void {
  write(KEYS.leads, leads().map((l) => (l.id === id ? { ...l, status } : l)));
}

const MANUAL = 'Demo mode sends nothing — copy the message and send it yourself.';

/** The demo-mode Executor. Job changes are real (in this browser); messages are not. */
async function executeLocally(task: AgentTask, text: string): Promise<{ ok: boolean; detail: string }> {
  const action = task.draft!.action;
  const job = 'jobId' in action ? (await getJobs()).find((j) => j.id === action.jobId) : undefined;
  if ('jobId' in action && !job) return { ok: false, detail: 'That job no longer exists.' };

  switch (action.kind) {
    case 'approve_job':
      if (job!.status !== 'New') return { ok: false, detail: `This job is already ${job!.status}.` };
      await approveJob(action.jobId);
      return { ok: true, detail: 'Job approved.' };
    case 'decline_job':
      if (job!.status !== 'New') return { ok: false, detail: `This job is already ${job!.status}.` };
      await rejectJob(action.jobId, action.note);
      return { ok: true, detail: action.notifyNeighbor && text ? `Job closed. ${MANUAL}` : 'Job closed.' };
    case 'message_neighbor':
      return { ok: true, detail: MANUAL };
    case 'assign_butler':
      if (job!.status !== 'Approved' || job!.assignedButlerId) return { ok: false, detail: 'Someone already has this job, or it is no longer open.' };
      await assignJob(action.jobId, action.butlerIds[0], text);
      return { ok: true, detail: 'Assigned, and the Butler was notified in the app.' };
    case 'post_groupme':
      return { ok: true, detail: 'Paste this into the GroupMe group yourself.' };
    case 'mark_posted':
      write(KEYS.leads, leads().map((l) => (l.id === action.leadId ? { ...l, status: 'replied' } : l)));
      return { ok: true, detail: 'Marked as posted.' };
    case 'notify_butlers': {
      const at = new Date().toISOString();
      const roster = read<{ id: string; notifications?: { message: string; at: string; read: boolean }[] }[]>(KEYS.butlers, []);
      for (const b of roster) {
        if (action.butlerIds.includes(b.id)) b.notifications = [{ message: text, at, read: false }, ...(b.notifications ?? [])];
      }
      write(KEYS.butlers, roster);
      return { ok: true, detail: `Sent to ${action.butlerIds.length} Butler${action.butlerIds.length > 1 ? 's' : ''} in the app.` };
    }
    case 'send_email':
      if (action.leadId && action.leadStatus) {
        const current = leads().find((l) => l.id === action.leadId);
        if (current && leadStatusAdvances(current.status, action.leadStatus)) setLocalLeadStatus(action.leadId, action.leadStatus);
      }
      return { ok: true, detail: `Demo mode sends nothing — email this to ${action.to} yourself.` };
    case 'manual_post':
      return { ok: true, detail: `Marked as posted on ${action.where}.` };
    case 'apply_config':
      write(KEYS.config, { ...read<Record<string, unknown>>(KEYS.config, {}), ...action.patch });
      return { ok: true, detail: `Applied: ${action.summary}.` };
    case 'acknowledge':
      return { ok: true, detail: 'Acknowledged.' };
  }
}

export async function decideLocally(taskId: string, input: Omit<DecisionInput, 'admin'>): Promise<{ ok: boolean; message: string }> {
  const task = tasks().find((t) => t.id === taskId);
  if (!task) throw new Error('That card no longer exists.');
  const now = new Date();

  if ((input.decision as string) === 'retry') {
    saveTask({ ...task, state: 'queued', attempts: 0, draft: null, deadline: null, lastError: '', runAfter: now.toISOString(), updatedAt: now.toISOString() });
    return { ok: true, message: 'Queued for the next run' };
  }

  const admin = (await getAdminSession())?.email ?? 'admin';
  const outcome = applyDecision(task, { ...input, admin }, localConfig(), now);
  saveTask(outcome.task);
  if (!outcome.execute) return { ok: true, message: outcome.message };

  const result = await executeLocally(outcome.task, outcome.execute.text);
  saveTask(finishExecution(outcome.task, result.ok, result.detail, new Date()));
  return { ok: result.ok, message: result.detail };
}
