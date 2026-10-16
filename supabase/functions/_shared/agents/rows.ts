/*
 * Postgres row <-> agent type mapping, shared by the edge functions (which
 * write) and the dashboard (which reads agent_tasks under admin RLS).
 */
import type { AgentJob, AgentTask, Lead } from './types.ts';

export interface TaskRow {
  id: string;
  type: AgentTask['type'];
  subject_type: AgentTask['subjectType'];
  subject_id: string;
  idempotency_key: string;
  state: AgentTask['state'];
  priority: number;
  attempts: number;
  draft: AgentTask['draft'];
  decisions: AgentTask['decisions'] | null;
  last_error: string;
  closed_reason: string;
  deadline: string | null;
  run_after: string;
  created_at: string;
  updated_at: string;
}

export const TASK_COLUMNS =
  'id,type,subject_type,subject_id,idempotency_key,state,priority,attempts,draft,decisions,last_error,closed_reason,deadline,run_after,created_at,updated_at';

export function taskFromRow(row: TaskRow): AgentTask {
  return {
    id: row.id,
    type: row.type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    priority: row.priority,
    attempts: row.attempts,
    draft: row.draft,
    decisions: row.decisions ?? [],
    lastError: row.last_error ?? '',
    closedReason: row.closed_reason ?? '',
    deadline: row.deadline,
    runAfter: row.run_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The columns a save may change. id, type, subject and key never move. */
export function taskUpdate(task: AgentTask): Partial<TaskRow> {
  return {
    state: task.state,
    priority: task.priority,
    attempts: task.attempts,
    draft: task.draft,
    decisions: task.decisions,
    last_error: task.lastError,
    closed_reason: task.closedReason,
    deadline: task.deadline,
    run_after: task.runAfter,
    updated_at: task.updatedAt,
  };
}

export interface JobRowForAgents {
  id: string;
  service: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  scheduled_for: string;
  budget: string;
  details: string;
  submitted_at: string;
  status: AgentJob['status'];
  assigned_butler_id: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  rating: number | null;
}

export const AGENT_JOB_COLUMNS =
  'id,service,name,phone,email,address,scheduled_for,budget,details,submitted_at,status,assigned_butler_id,assigned_at,completed_at,rating';

export function jobFromRow(row: JobRowForAgents): AgentJob {
  return {
    id: row.id,
    service: row.service,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    date: row.scheduled_for,
    budget: row.budget,
    details: row.details,
    submittedAt: row.submitted_at,
    status: row.status,
    assignedButlerId: row.assigned_butler_id,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    ...(row.rating === null ? {} : { rating: row.rating }),
  };
}

export interface LeadRow {
  id: string;
  channel: Lead['channel'];
  text: string;
  town: string;
  author: string;
  status: Lead['status'];
  created_at: string;
}

export function leadFromRow(row: LeadRow): Lead {
  return { id: row.id, channel: row.channel, text: row.text, town: row.town, author: row.author, status: row.status, createdAt: row.created_at };
}

/**
 * What a butler's job history says about them, for ranking. `jobs` are
 * every job assigned to anyone; this picks out the ones that were theirs.
 */
export function butlerStats(butlerId: string, jobs: AgentJob[], now: Date) {
  const mine = jobs.filter((j) => j.assignedButlerId === butlerId);
  const completed = mine.filter((j) => j.status === 'Completed');
  const ratings = completed.map((j) => j.rating).filter((r): r is number => typeof r === 'number');
  const twoWeeksAgo = +now - 14 * 24 * 3600 * 1000;
  return {
    assigned: mine.length,
    completed: completed.length,
    ratings,
    jobsLast14Days: mine.filter((j) => j.assignedAt && +new Date(j.assignedAt) >= twoWeeksAgo).length,
    openJobs: mine.filter((j) => j.status === 'Assigned').length,
    happyCustomers: completed
      .filter((j) => (j.rating ?? 0) >= 4)
      .flatMap((j) => [j.phone.replace(/\D/g, '').slice(-10), j.email.trim().toLowerCase()])
      .filter(Boolean),
  };
}

/** Approved texts from finished tasks, edited ones first: the agents' few-shot examples. */
export function approvedTexts(tasks: AgentTask[]): string[] {
  const out: { text: string; edited: boolean; at: string }[] = [];
  for (const task of tasks) {
    const last = [...task.decisions].reverse().find((d) => d.decision === 'approve' || d.decision === 'edit');
    if (last?.finalText) out.push({ text: last.finalText, edited: last.decision === 'edit', at: last.at });
  }
  return out.sort((a, b) => Number(b.edited) - Number(a.edited) || b.at.localeCompare(a.at)).map((e) => e.text);
}
