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
  /** Why an admin closed it. The Analyst reads waitlist notes ("Outside our service area (Palatine)") as demand. */
  rejectNote?: string;
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
  /** 'Draft' | 'Pending' | 'Approved' | 'Rejected', or '' in demo mode. */
  profileStatus: string;
  signedUpAt: string;
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

/**
 * Something an admin brought in: a post to reply to (nextdoor, instagram,
 * email, other), a business to reach out to (b2b), or a website inquiry (web).
 */
export interface Lead {
  id: string;
  channel: 'nextdoor' | 'instagram' | 'email' | 'other' | 'b2b' | 'web';
  /** The post, or for b2b/web the admin's notes about what they need. */
  text: string;
  town: string;
  /** First name of the admin who added it — replies and outreach are written as them. */
  author: string;
  status: LeadStatus;
  /** b2b/web only: org, segment, contactName, email, budget, website. */
  details: Record<string, string>;
  createdAt: string;
}

export type LeadStatus = 'new' | 'contacted' | 'replied' | 'won' | 'dropped';

export type AgentId =
  | 'dispatcher' | 'intake' | 'safety' | 'matchmaker' | 'lead_scout' | 'voice' | 'care'
  | 'recruiter' | 'b2b' | 'web_studio' | 'analyst';

export type TaskType =
  | 'JOB_INTAKE' | 'JOB_MATCH' | 'MATCH_ESCALATE' | 'LEAD_TRIAGE' | 'JOB_FOLLOWUP'
  | 'SUPPLY_CHECK' | 'B2B_OUTREACH' | 'WEB_LEAD' | 'WEB_BRIEF' | 'WEEKLY_REVIEW' | 'CONFIG_PROPOSAL';

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
  /** jobId is absent for recruiting posts that aren't about one job. */
  | { kind: 'post_groupme'; jobId?: string }
  | { kind: 'mark_posted'; leadId: string }
  /** An in-app message to these Butlers (profile nudges, check-ins). */
  | { kind: 'notify_butlers'; butlerIds: string[] }
  /** An email to someone who isn't a job's neighbor: a business, a website client. */
  | { kind: 'send_email'; to: string; subject: string; leadId?: string; leadStatus?: LeadStatus }
  /** Text the admin posts by hand somewhere (a Nextdoor post, a note to a partner school). */
  | { kind: 'manual_post'; where: string }
  /** A policy change, written as a new agent_config version. `patch` replaces whole top-level keys. */
  | { kind: 'apply_config'; patch: Record<string, unknown>; summary: string }
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
  /**
   * 'job' or 'lead' and that row's id — a pointer, not a copy of the
   * neighbour's details. 'system' tasks (recruiting findings, the weekly
   * review, config proposals) carry a short descriptor such as
   * "gap|Barrington|Snow shoveling" instead.
   */
  subjectType: 'job' | 'lead' | 'system';
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
