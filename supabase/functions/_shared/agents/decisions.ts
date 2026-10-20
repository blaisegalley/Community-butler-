/*
 * The Human Approval Gate's rules: what each admin decision does to a
 * task, and when the Executor is allowed to act.
 *
 * Kept separate from any storage so the two-admin rule and the
 * "edit before you can send a blocked message" rule hold identically in
 * the edge function and in demo mode.
 */
import type { AgentConfig } from './config.ts';
import { screenMessage } from './rules.ts';
import type { Action, AgentTask, Decision } from './types.ts';

export type RejectReason = 'tone' | 'wrong_facts' | 'unsafe' | 'not_worth_it' | 'duplicate';

export const REJECT_REASONS: { id: RejectReason; label: string; sendsBack: boolean }[] = [
  { id: 'tone', label: "Tone isn't right — redraft it", sendsBack: true },
  { id: 'wrong_facts', label: 'Wrong facts — redraft it', sendsBack: true },
  { id: 'unsafe', label: 'Unsafe', sendsBack: false },
  { id: 'not_worth_it', label: 'Not worth doing', sendsBack: false },
  { id: 'duplicate', label: 'Duplicate', sendsBack: false },
];

const MAX_SEND_BACKS = 2;

export interface DecisionInput {
  admin: string;
  decision: Decision['decision'];
  reason?: string;
  /** The text the admin approved — possibly edited, possibly a different variant. */
  text?: string;
}

export interface DecisionOutcome {
  task: AgentTask;
  /** What the Executor should do now, if anything. */
  execute: { action: Action; text: string } | null;
  message: string;
}

export class DecisionError extends Error {}

export function applyDecision(task: AgentTask, input: DecisionInput, config: AgentConfig, now: Date): DecisionOutcome {
  if (task.state !== 'awaiting_approval' || !task.draft) {
    throw new DecisionError(`This card is ${task.state.replace('_', ' ')} and can't be acted on.`);
  }
  const draft = task.draft;
  const text = (input.text ?? draft.text).trim();
  const at = now.toISOString();
  const record: Decision = { admin: input.admin, decision: input.decision, reason: input.reason ?? '', finalText: text, at };
  const withDecision = { ...task, decisions: [...task.decisions, record], updatedAt: at };

  switch (input.decision) {
    case 'approve':
    case 'edit': {
      const edited = text !== draft.text.trim() && !draft.variants.includes(text);
      const problems = text ? screenMessage(text, draft.channel, config) : [];
      if (problems.length) throw new DecisionError(`Fix the message before sending: ${problems.join('; ')}.`);
      const sends = draft.action.kind !== 'acknowledge' && draft.action.kind !== 'approve_job' && draft.channel !== 'none';
      if (sends && !text && draft.action.kind !== 'decline_job') throw new DecisionError('The message is empty.');
      record.decision = edited ? 'edit' : 'approve';
      return { task: withDecision, execute: { action: draft.action, text }, message: 'Approved' };
    }
    case 'reject': {
      const reason = REJECT_REASONS.find((r) => r.id === input.reason);
      if (!reason) throw new DecisionError('Pick a reason so the agents can learn from it.');
      const sendBacks = task.decisions.filter((d) => d.decision === 'reject' && REJECT_REASONS.find((r) => r.id === d.reason)?.sendsBack).length;
      if (reason.sendsBack && sendBacks < MAX_SEND_BACKS) {
        return {
          task: { ...withDecision, state: 'queued', draft: null, deadline: null, runAfter: at, attempts: 0 },
          execute: null,
          message: 'Sent back for a new draft',
        };
      }
      return { task: { ...withDecision, state: 'closed', closedReason: `Rejected: ${reason.label}` }, execute: null, message: 'Rejected' };
    }
    case 'snooze': {
      const until = new Date(+now + 24 * 3600 * 1000).toISOString();
      const deadline = task.deadline && +new Date(task.deadline) < +new Date(until) + 3600 * 1000
        ? new Date(+new Date(until) + 24 * 3600 * 1000).toISOString()
        : task.deadline;
      return { task: { ...withDecision, runAfter: until, deadline }, execute: null, message: 'Snoozed for a day' };
    }
    case 'override': {
      if (!draft.flags.includes('two_admins_to_override') || draft.action.kind !== 'decline_job') {
        throw new DecisionError('Only a Red-tier decline can be overridden.');
      }
      const admins = new Set(withDecision.decisions.filter((d) => d.decision === 'override').map((d) => d.admin.toLowerCase()));
      if (admins.size < 2) {
        return { task: withDecision, execute: null, message: 'Override recorded. A second admin has to override too before the job is approved.' };
      }
      return { task: withDecision, execute: { action: { kind: 'approve_job', jobId: draft.action.jobId }, text: '' }, message: 'Two admins overrode the safety decline' };
    }
    default:
      throw new DecisionError('Unknown decision.');
  }
}

/** Called after the Executor reports back. */
export function finishExecution(task: AgentTask, ok: boolean, detail: string, now: Date): AgentTask {
  const at = now.toISOString();
  return ok
    ? { ...task, state: 'done', closedReason: detail, lastError: '', updatedAt: at }
    : { ...task, lastError: detail, updatedAt: at };
}
