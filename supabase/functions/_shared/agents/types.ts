/*
 * Shared types for the agent system.
 *
 * Everything under _shared/agents/ is plain TypeScript with no Deno, Node
 * or browser APIs, so the same code runs in three places: the
 * agent-dispatcher edge function (Deno), the admin dashboard's demo mode
 * (browser), and the unit tests (Node). Keep it that way — an import of
 * Deno.env or localStorage in here breaks two of the three.
 */

export type JobStatus = 'New' | 'Approved' | 'Assigned' | 'Completed' | 'Rejected';

/** A job as the agents see it. Field names match the dashboard's `Job`. */
export interface AgentJob {
  id: string;
  service: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  date: string;
  budget: string;
  details: string;
  submittedAt: string;
  status: JobStatus;
  assignedButlerId: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  rating?: number;
}

/** A butler as the Matchmaker sees it: enough to rank, nothing more. */
export interface AgentButler {
  id: string;
  name: string;
  serviceArea: string;
  jobTypePrefs: string[];
  /** 'Freshman' | 'Sophomore' | 'Junior' | 'Senior' | '' when unknown. */
  grade: string;
  /** True when a manager has approved the public profile (hosted backend), or always in demo mode. */
  approved: boolean;
  stats: {
    assigned: number;
    completed: number;
    ratings: number[];
    jobsLast14Days: number;
    openJobs: number;
    /** Phone numbers / emails of neighbours this butler worked for and got >= 4 stars from. */
    happyCustomers: string[];
  };
}

export interface Lead {
  id: string;
  channel: 'nextdoor' | 'instagram' | 'email' | 'other';
  text: string;
  town: string;
  /** First name of the admin who pasted it — Nextdoor replies are written as them. */
  author: string;
  status: 'new' | 'replied' | 'dropped';
  createdAt: string;
}

export type AgentId = 'dispatcher' | 'intake' | 'safety' | 'matchmaker' | 'lead_scout' | 'voice' | 'care';

export type TaskType = 'JOB_INTAKE' | 'JOB_MATCH' | 'MATCH_ESCALATE' | 'LEAD_TRIAGE' | 'JOB_FOLLOWUP';

export type TaskState =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'done'
  | 'retry'
  | 'dead_letter'
  | 'closed'
  | 'expired';

export type Tier = 'Green' | 'Yellow' | 'Red';

export type Channel = 'email' | 'groupme' | 'nextdoor' | 'instagram' | 'butler_app' | 'internal' | 'none';

/**
 * What happens if an admin approves a card. The Executor is the only thing
 * that turns one of these into a real-world effect.
 */
export type Action =
  | { kind: 'approve_job'; jobId: string }
  | { kind: 'decline_job'; jobId: string; note: string; notifyNeighbor: boolean }
  | { kind: 'message_neighbor'; jobId: string; subject: string }
  | { kind: 'assign_butler'; jobId: string; butlerIds: string[] }
  | { kind: 'post_groupme'; jobId: string }
  | { kind: 'mark_posted'; leadId: string }
  | { kind: 'acknowledge' };

export interface SafetyResult {
  tier: Tier;
  reasons: string[];
  /** Conditions that travel with an approved job to the Matchmaker. */
  conditions: { pairRequired: boolean; minGrade: string; daylightOnly: boolean };
  /** Problems with an outbound message (PII, promises). Any entry blocks approval as-is. */
  messageProblems: string[];
}

export interface VoiceResult {
  pass: boolean;
  scores: Record<string, number>;
  fixNotes: string[];
}

export interface Draft {
  agent: AgentId;
  title: string;
  /** One or two sentences: why the agent proposes this. */
  summary: string;
  /** The editable outbound text. Empty when the action sends nothing. */
  text: string;
  /** Alternatives the admin can switch to (Lead Scout). */
  variants: string[];
  channel: Channel;
  action: Action;
  safety: SafetyResult;
  voice: VoiceResult | null;
  confidence: number;
  source: 'model' | 'template';
  revisions: number;
  /** 'template', 'needs_polish', 'low_confidence', 'blocked_message', 'two_admins_to_override' … */
  flags: string[];
  /** Short label/value pairs shown on the card. */
  facts: [string, string][];
}

export interface Decision {
  admin: string;
  decision: 'approve' | 'edit' | 'reject' | 'snooze' | 'override';
  reason: string;
  finalText: string;
  at: string;
}

export interface AgentTask {
  id: string;
  type: TaskType;
  /** 'job' or 'lead', and the id of that row. A pointer, not a copy of the neighbour's details. */
  subjectType: 'job' | 'lead';
  subjectId: string;
  idempotencyKey: string;
  state: TaskState;
  priority: number;
  attempts: number;
  draft: Draft | null;
  decisions: Decision[];
  lastError: string;
  closedReason: string;
  deadline: string | null;
  runAfter: string;
  createdAt: string;
  updatedAt: string;
}

export type NewTask = Pick<AgentTask, 'type' | 'subjectType' | 'subjectId' | 'idempotencyKey' | 'priority'>;

/** One model or template call, for the cost ledger and debugging. */
export interface AgentRun {
  taskId: string;
  agent: AgentId;
  purpose: string;
  mode: 'model' | 'template';
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error: string;
  at: string;
}
