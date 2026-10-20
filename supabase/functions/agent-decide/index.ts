/*
 * The Human Approval Gate and the Executor, hosted.
 *
 * An admin's tap on an approval card lands here. The decision is checked
 * against the rules in _shared/agents/decisions.ts (blocked messages must
 * be edited first, a Red override needs two different admins), recorded
 * on the task, and only then acted on.
 *
 * Body: { taskId, decision: 'approve'|'edit'|'reject'|'snooze'|'override'|'retry', reason?, text? }
 */
import { json, preflight } from '../_shared/http.ts';
import { requireAdmin, serviceClient } from '../_shared/supabase.ts';
import { applyDecision, DecisionError, finishExecution } from '../_shared/agents/index.ts';
import { execute, loadAgentConfig, loadTask, saveTask } from '../_shared/agentRuntime.ts';

const DECISIONS = ['approve', 'edit', 'reject', 'snooze', 'override', 'retry'] as const;
type Body = { taskId?: string; decision?: (typeof DECISIONS)[number]; reason?: string; text?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }
  if (!body.taskId || !body.decision || !DECISIONS.includes(body.decision)) {
    return json({ error: 'Expected { taskId, decision }' }, 400);
  }

  const db = serviceClient();
  const task = await loadTask(db, body.taskId);
  if (!task) return json({ error: 'No such card' }, 404);

  const { data: admin } = await db.from('admins').select('email').eq('user_id', auth.userId).maybeSingle();
  const adminEmail = admin?.email ?? auth.userId;
  const now = new Date();

  // A dead-lettered task goes back in the queue for the next run.
  if (body.decision === 'retry') {
    if (task.state !== 'dead_letter' && task.state !== 'expired') return json({ error: 'Only failed or expired cards can be retried' }, 400);
    await saveTask(db, { ...task, state: 'queued', attempts: 0, draft: null, deadline: null, lastError: '', runAfter: now.toISOString(), updatedAt: now.toISOString() });
    return json({ ok: true, message: 'Queued for the next run' });
  }

  const config = await loadAgentConfig(db);
  let outcome;
  try {
    outcome = applyDecision(task, { admin: adminEmail, decision: body.decision, reason: body.reason, text: body.text }, config, now);
  } catch (cause) {
    if (cause instanceof DecisionError) return json({ error: cause.message }, 400);
    throw cause;
  }

  // Record the decision before acting, so even a failed send leaves a trail.
  await saveTask(db, outcome.task);
  if (!outcome.execute) return json({ ok: true, message: outcome.message, state: outcome.task.state });

  const result = await execute(db, outcome.execute.action, outcome.execute.text, config, req.headers.get('Authorization') ?? '');
  const finished = finishExecution(outcome.task, result.ok, result.detail, new Date());
  await saveTask(db, finished);
  return json({ ok: result.ok, message: result.detail, state: finished.state }, result.ok ? 200 : 409);
});
