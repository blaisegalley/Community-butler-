/*
 * A0 Dispatcher: decides what work exists, runs it, and moves each task
 * through its states. No model calls of its own.
 *
 * It is written against a small IO interface so the hosted backend
 * (Postgres, via the agent-dispatcher edge function) and demo mode
 * (localStorage) share every rule about routing, retries and expiry.
 */
import type { AgentConfig } from './config.ts';
import type { AnalystInput } from './analyst.ts';
import { planAnalyst, reviewDue, runProposal, runWeeklyReview } from './analyst.ts';
import { planOutreach, runOutreach, runWebBrief, runWebLead } from './b2b.ts';
import { runCare } from './care.ts';
import { runIntake } from './intake.ts';
import { runLeadScout } from './leadScout.ts';
import type { AgentContext, Llm } from './llm.ts';
import { runMatch } from './matchmaker.ts';
import { planRecruiting, runRecruiter } from './recruiter.ts';
import { normalizeService, ruleSafety } from './rules.ts';
import type { AgentButler, AgentId, AgentJob, AgentRun, AgentTask, Draft, Lead, NewTask, SafetyResult, TaskType } from './types.ts';

export interface DispatcherIO {
  now(): Date;
  llm: Llm | null;
  config: AgentConfig;
  loadJobs(): Promise<AgentJob[]>;
  loadButlers(): Promise<AgentButler[]>;
  loadLead(id: string): Promise<Lead | null>;
  /** Every task's idempotency key with when it was created — enough to plan without loading drafts. */
  taskIndex(): Promise<Map<string, { createdAt: string; state: string }>>;
  insertTasks(tasks: NewTask[]): Promise<void>;
  /** Marks up to `limit` due tasks as running (attempts + 1) and returns them. Must be safe against a concurrent run. */
  claimTasks(limit: number): Promise<AgentTask[]>;
  saveTask(task: AgentTask): Promise<void>;
  /** Tasks waiting on a human, for the expiry sweep. */
  awaitingTasks(): Promise<AgentTask[]>;
  /** The Safety result the intake card carried, so Yellow conditions follow the job to matching. */
  intakeSafety(jobId: string): Promise<SafetyResult | null>;
  /** Recently approved texts from this agent, newest first. */
  examples(agent: AgentId): Promise<string[]>;
  /** Replies already posted from copy packs, to avoid repeating ourselves on Nextdoor. */
  postedReplies(): Promise<string[]>;
  setLeadStatus(id: string, status: Lead['status']): Promise<void>;
  logRuns(runs: AgentRun[]): Promise<void>;
  monthSpendUsd(): Promise<number>;
  /** Prospects and website inquiries (and pasted posts), for outreach planning and the weekly review. */
  loadLeads(): Promise<Lead[]>;
  /** Tasks created or updated in the last `days`, for the Analyst. Only read once a week. */
  recentTasks(days: number): Promise<AgentTask[]>;
  recentRuns(days: number): Promise<AgentRun[]>;
}

export interface RunSummary {
  enqueued: number;
  processed: number;
  awaitingApproval: number;
  closed: number;
  failed: number;
  expired: number;
  templateMode: boolean;
  notes: string[];
}

const AGENT_FOR: Record<TaskType, AgentId> = {
  JOB_INTAKE: 'intake',
  JOB_MATCH: 'matchmaker',
  MATCH_ESCALATE: 'matchmaker',
  LEAD_TRIAGE: 'lead_scout',
  JOB_FOLLOWUP: 'care',
  SUPPLY_CHECK: 'recruiter',
  B2B_OUTREACH: 'b2b',
  WEB_LEAD: 'web_studio',
  WEB_BRIEF: 'web_studio',
  WEEKLY_REVIEW: 'analyst',
  CONFIG_PROPOSAL: 'analyst',
};

const MAX_ATTEMPTS = 3;
const HOUR = 3600 * 1000;

/**
 * Works out which tasks should exist given the jobs, and returns the ones
 * that don't yet. Idempotency keys make this safe to run every minute:
 * the same job never gets two intake cards.
 */
export function planTasks(
  jobs: AgentJob[],
  index: Map<string, { createdAt: string; state: string }>,
  config: AgentConfig,
  now: Date,
): NewTask[] {
  const out: NewTask[] = [];
  const add = (task: NewTask) => {
    if (!index.has(task.idempotencyKey) && !out.some((t) => t.idempotencyKey === task.idempotencyKey)) out.push(task);
  };

  for (const job of jobs) {
    const age = +now - +new Date(job.submittedAt);
    if (job.status === 'New' && age < 30 * 24 * HOUR) {
      add({ type: 'JOB_INTAKE', subjectType: 'job', subjectId: job.id, idempotencyKey: `job:${job.id}:intake`, priority: 1 });
    }
    if (job.status === 'Approved' && !job.assignedButlerId) {
      const matchKey = `job:${job.id}:match`;
      add({ type: 'JOB_MATCH', subjectType: 'job', subjectId: job.id, idempotencyKey: matchKey, priority: 2 });
      const match = index.get(matchKey);
      if (match) {
        const snow = normalizeService(job.service, job.details) === 'Snow shoveling';
        const first = (snow ? config.escalation.snowFirstHours : config.escalation.firstHours) * HOUR;
        const second = (snow ? config.escalation.snowSecondHours : config.escalation.secondHours) * HOUR;
        const waited = +now - +new Date(match.createdAt);
        if (waited >= first) add({ type: 'MATCH_ESCALATE', subjectType: 'job', subjectId: job.id, idempotencyKey: `job:${job.id}:escalate:1`, priority: 3 });
        if (waited >= second) add({ type: 'MATCH_ESCALATE', subjectType: 'job', subjectId: job.id, idempotencyKey: `job:${job.id}:escalate:2`, priority: 3 });
      }
    }
    if (job.status === 'Completed' && job.completedAt && +now - +new Date(job.completedAt) < config.followupWindowDays * 24 * HOUR) {
      add({ type: 'JOB_FOLLOWUP', subjectType: 'job', subjectId: job.id, idempotencyKey: `job:${job.id}:followup`, priority: 1 });
    }
  }
  return out;
}

export function retryDelayMinutes(attempts: number): number {
  return Math.min(60, 2 ** attempts);
}

function deadlineFor(draft: Draft, config: AgentConfig, now: Date): string {
  const hours =
    draft.agent === 'lead_scout' ? config.deadlinesHours.lead
      : draft.agent === 'analyst' ? config.deadlinesHours.review
        : config.deadlinesHours.default;
  return new Date(+now + hours * HOUR).toISOString();
}

/** Runs one task's agent. Returns a draft for a human, or a reason the task needs no card. */
async function processTask(
  task: AgentTask,
  io: DispatcherIO,
  ctx: AgentContext,
  jobs: AgentJob[],
  butlers: AgentButler[],
  analystInput: () => Promise<AnalystInput>,
): Promise<{ draft: Draft; priority: number } | { close: string }> {
  const { config } = io;
  const now = io.now();

  if (task.subjectType === 'system') {
    switch (task.type) {
      case 'SUPPLY_CHECK':
        return runRecruiter(task.subjectId, jobs, butlers, ctx, config, now);
      case 'WEEKLY_REVIEW':
        return runWeeklyReview(await analystInput(), ctx, config, now);
      case 'CONFIG_PROPOSAL':
        return runProposal(task.subjectId, await analystInput(), config, now);
      default:
        return { close: `No agent handles ${task.type}` };
    }
  }

  if (task.subjectType === 'lead') {
    const lead = await io.loadLead(task.subjectId);
    if (!lead) return { close: 'Lead no longer exists' };
    if (task.type === 'B2B_OUTREACH' || task.type === 'WEB_LEAD' || task.type === 'WEB_BRIEF') {
      const step = Number(task.idempotencyKey.split(':').pop()) || 0;
      const result =
        task.type === 'B2B_OUTREACH' ? await runOutreach(lead, step, ctx, config)
          : task.type === 'WEB_LEAD' ? await runWebLead(lead, ctx, config)
            : await runWebBrief(lead, ctx, config);
      if ('close' in result && result.leadStatus) await io.setLeadStatus(lead.id, result.leadStatus);
      return result;
    }
    const result = await runLeadScout(lead, await io.postedReplies(), ctx, config, now, lead.author);
    if (!result.draft) {
      await io.setLeadStatus(lead.id, 'dropped');
      return { close: `Not worth a reply: ${result.reason}` };
    }
    return { draft: result.draft, priority: result.score >= 0.8 ? 3 : 2 };
  }

  const job = jobs.find((j) => j.id === task.subjectId);
  if (!job) return { close: 'Job no longer exists' };

  switch (task.type) {
    case 'JOB_INTAKE':
      if (job.status !== 'New') return { close: `Already handled (job is ${job.status})` };
      return runIntake(job, jobs, ctx, config, now);
    case 'JOB_MATCH':
    case 'MATCH_ESCALATE': {
      if (job.status !== 'Approved' || job.assignedButlerId) return { close: `Already handled (job is ${job.status})` };
      const safety = (await io.intakeSafety(job.id)) ?? ruleSafety(job, normalizeService(job.service, job.details), config);
      const escalation = task.type === 'MATCH_ESCALATE' ? Number(task.idempotencyKey.split(':').pop()) || 1 : 0;
      return runMatch(job, butlers, safety, ctx, config, { escalation });
    }
    case 'JOB_FOLLOWUP':
      if (job.status !== 'Completed') return { close: `Job is ${job.status}, not Completed` };
      return runCare(job, butlers.find((b) => b.id === job.assignedButlerId) ?? null, ctx, config);
    default:
      return { close: `No agent handles ${task.type}` };
  }
}

export async function runDispatcher(io: DispatcherIO, options: { limit?: number } = {}): Promise<RunSummary> {
  const { config } = io;
  const now = io.now();
  const summary: RunSummary = { enqueued: 0, processed: 0, awaitingApproval: 0, closed: 0, failed: 0, expired: 0, templateMode: !io.llm, notes: [] };

  if (config.killSwitches.all) {
    summary.notes.push('All agents are switched off in settings.');
    return summary;
  }

  let llm = io.llm;
  if (llm && (await io.monthSpendUsd()) >= config.monthlyBudgetUsd) {
    llm = null;
    summary.templateMode = true;
    summary.notes.push(`Monthly AI budget of $${config.monthlyBudgetUsd} reached — drafting from templates until next month.`);
  }

  const [jobs, butlers, leads, index] = await Promise.all([io.loadJobs(), io.loadButlers(), io.loadLeads(), io.taskIndex()]);

  // The Analyst's inputs are a few hundred rows; read them only on the run that needs them.
  let analystCache: Promise<AnalystInput> | null = null;
  const analystInput = () =>
    (analystCache ??= Promise.all([io.recentTasks(31), io.recentRuns(31)]).then(([tasks, runs]) => ({ jobs, tasks, runs, leads })));

  const planned = [
    ...planTasks(jobs, index, config, now),
    ...planRecruiting(jobs, butlers, index, config, now),
    ...planOutreach(leads, index, config, now),
  ];
  if (reviewDue(index, config, now)) planned.push(...planAnalyst(await analystInput(), index, config, now));
  if (planned.length) await io.insertTasks(planned);
  summary.enqueued = planned.length;

  const claimed = await io.claimTasks(options.limit ?? 10);

  for (const task of claimed) {
    const agent = AGENT_FOR[task.type];
    if (config.killSwitches[agent]) {
      await io.saveTask({ ...task, state: 'queued', attempts: Math.max(0, task.attempts - 1), runAfter: new Date(+now + HOUR).toISOString(), lastError: `${agent} is switched off`, updatedAt: now.toISOString() });
      continue;
    }

    const runs: AgentRun[] = [];
    const ctx: AgentContext = {
      llm,
      examples: await io.examples(agent),
      costPerMillion: config.pricing,
      log: (run) => runs.push({ ...run, taskId: task.id, at: io.now().toISOString() }),
    };

    try {
      const result = await processTask(task, io, ctx, jobs, butlers, analystInput);
      summary.processed++;
      if ('close' in result) {
        await io.saveTask({ ...task, state: 'closed', closedReason: result.close, lastError: '', updatedAt: io.now().toISOString() });
        summary.closed++;
      } else {
        await io.saveTask({
          ...task,
          state: 'awaiting_approval',
          draft: result.draft,
          priority: Math.max(task.priority, result.priority),
          deadline: deadlineFor(result.draft, config, now),
          lastError: '',
          updatedAt: io.now().toISOString(),
        });
        summary.awaitingApproval++;
      }
    } catch (cause) {
      const message = (cause as Error)?.message ?? String(cause);
      const dead = task.attempts >= MAX_ATTEMPTS;
      await io.saveTask({
        ...task,
        state: dead ? 'dead_letter' : 'retry',
        lastError: message,
        runAfter: new Date(+now + retryDelayMinutes(task.attempts) * 60000).toISOString(),
        updatedAt: io.now().toISOString(),
      });
      summary.failed++;
      if (dead) summary.notes.push(`A ${task.type} task failed ${MAX_ATTEMPTS} times and needs a look: ${message}`);
    }
    if (runs.length) await io.logRuns(runs);
  }

  // Fail closed: a draft nobody approved in time is archived, never sent late.
  for (const task of await io.awaitingTasks()) {
    if (task.deadline && +new Date(task.deadline) < +now) {
      await io.saveTask({ ...task, state: 'expired', closedReason: 'Nobody approved it before the deadline', updatedAt: now.toISOString() });
      summary.expired++;
    }
  }
  return summary;
}

/** A fresh task row from a plan entry. */
export function newTaskRow(task: NewTask, id: string, now: Date): AgentTask {
  const at = now.toISOString();
  return { ...task, id, state: 'queued', attempts: 0, draft: null, decisions: [], lastError: '', closedReason: '', deadline: null, runAfter: at, createdAt: at, updatedAt: at };
}
