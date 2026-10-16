/*
 * What the Approvals tab can ask of the agent system, on either backend.
 *
 *   remote — agent_tasks is read directly (admins can, under RLS); runs
 *            and decisions go through the agent-dispatcher and
 *            agent-decide edge functions, which are the only things that
 *            can write a task or act on one.
 *   local  — demo mode; see ./local.ts.
 *
 * Both modules are imported lazily so the homepage never downloads the
 * agent code.
 */
import type { AgentTask, DecisionInput, Lead, RunSummary } from '@agents/index.ts';
import { isShared, refreshAll } from '@/lib/store';

export type { AgentTask, Draft, RunSummary } from '@agents/index.ts';
export type DecisionKind = DecisionInput['decision'] | 'retry';

const OPEN_STATES = ['awaiting_approval', 'queued', 'running', 'retry', 'dead_letter'];

async function remoteClient() {
  const { supabase } = await import('@/lib/supabase');
  return supabase();
}

/** Pulls the server's error message out of a failed edge function call. */
async function functionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      /* not JSON */
    }
  }
  return (error as Error)?.message ?? fallback;
}

export async function getAgentTasks(): Promise<AgentTask[]> {
  if (!isShared) {
    const { localTasks } = await import('./local');
    return localTasks();
  }
  const { TASK_COLUMNS, taskFromRow } = await import('@agents/rows.ts');
  const db = await remoteClient();
  const [open, recent] = await Promise.all([
    db.from('agent_tasks').select(TASK_COLUMNS).in('state', OPEN_STATES).order('created_at', { ascending: false }).limit(200),
    db.from('agent_tasks').select(TASK_COLUMNS).not('state', 'in', `(${OPEN_STATES.join(',')})`).order('updated_at', { ascending: false }).limit(25),
  ]);
  if (open.error) throw new Error(`Could not load the approval queue: ${open.error.message}`);
  if (recent.error) throw new Error(`Could not load recent decisions: ${recent.error.message}`);
  return [...(open.data ?? []), ...(recent.data ?? [])].map(taskFromRow);
}

export async function runAgentsNow(): Promise<RunSummary> {
  if (!isShared) {
    const { runLocalAgents } = await import('./local');
    const summary = await runLocalAgents();
    refreshAll();
    return summary;
  }
  const db = await remoteClient();
  const { data, error } = await db.functions.invoke('agent-dispatcher', { body: {} });
  if (error) throw new Error(await functionError(error, 'The agents could not run.'));
  refreshAll();
  return data as RunSummary;
}

export async function decide(
  taskId: string,
  decision: DecisionKind,
  extra: { reason?: string; text?: string } = {},
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!isShared) {
      const { decideLocally } = await import('./local');
      return await decideLocally(taskId, { decision: decision as DecisionInput['decision'], ...extra });
    }
    const db = await remoteClient();
    const { data, error } = await db.functions.invoke('agent-decide', { body: { taskId, decision, ...extra } });
    if (error) return { ok: false, message: await functionError(error, 'That did not work. Try again.') };
    return { ok: Boolean(data?.ok), message: data?.message ?? '' };
  } finally {
    refreshAll();
  }
}

export async function submitLead(input: Pick<Lead, 'channel' | 'text' | 'town' | 'author'>): Promise<RunSummary> {
  if (!isShared) {
    const { submitLocalLead } = await import('./local');
    await submitLocalLead(input);
  } else {
    const db = await remoteClient();
    const { error } = await db.rpc('submit_lead', { p_channel: input.channel, p_text: input.text, p_town: input.town, p_author: input.author });
    if (error) throw new Error(`Could not save that post: ${error.message}`);
  }
  // Draft the reply straight away rather than waiting for the next scheduled run.
  return runAgentsNow();
}
