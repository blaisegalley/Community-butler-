/*
 * A0 Dispatcher, hosted.
 *
 * Runs every 5 minutes from pg_cron (see supabase/schedule.sql), and on
 * demand when an admin taps "Run agents now". Each run: plan the work the
 * current jobs imply, run up to 10 due tasks through their agents, and
 * expire anything nobody approved in time.
 *
 * It writes drafts only. Nothing here sends a message or changes a job —
 * that is agent-decide's job, and only after an admin approves.
 */
import { json, preflight } from '../_shared/http.ts';
import { requireAdmin, requireCronSecret, serviceClient } from '../_shared/supabase.ts';
import { runDispatcher } from '../_shared/agents/index.ts';
import { anthropicLlm } from '../_shared/agentLlm.ts';
import { loadAgentConfig, remoteIO } from '../_shared/agentRuntime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  // The schedule proves itself with the cron secret; a person with an admin session.
  if (req.headers.get('x-cron-secret')) {
    const denied = requireCronSecret(req);
    if (denied) return denied;
  } else {
    const auth = await requireAdmin(req);
    if (auth instanceof Response) return auth;
  }

  const db = serviceClient();
  try {
    const config = await loadAgentConfig(db);
    const summary = await runDispatcher(remoteIO(db, anthropicLlm(config.model), config));
    return json({ ok: true, ...summary });
  } catch (cause) {
    console.error('Dispatcher run failed:', cause);
    return json({ ok: false, error: (cause as Error).message }, 500);
  }
});
