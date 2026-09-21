#!/usr/bin/env node
/*
 * Checks a live Supabase project against what this app expects.
 *
 * Run it after following SETUP.md:
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/verify-backend.mjs
 *
 * It uses the anon key only — the same key the browser gets — so it also
 * doubles as a privacy check: anything it can read without signing in is
 * something the whole internet can read.
 *
 * It creates one test job and leaves it behind as a 'New' request. Reject
 * it from the admin dashboard afterwards.
 */

const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.');
  process.exit(1);
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// 1. Tables exist.
for (const table of ['jobs', 'butlers', 'admins', 'activity', 'push_subscriptions', 'butler_notifications']) {
  const { status } = await rest(`${table}?select=id&limit=1`);
  // 200 (empty, policy allows) or 401/403 (policy denies) both prove the
  // table is there. 404 means schema.sql was never run.
  check(`table "${table}" exists`, status !== 404, status === 404 ? 'run supabase/schema.sql' : `HTTP ${status}`);
}

// 2. Nothing readable while signed out. This is the important one: job
//    rows hold neighbours' home addresses.
for (const table of ['jobs', 'butlers', 'activity', 'push_subscriptions']) {
  const { status, body } = await rest(`${table}?select=*&limit=5`);
  const leaked = Array.isArray(body) && body.length > 0;
  check(
    `"${table}" is not readable by the public`,
    !leaked,
    leaked ? `LEAK: returned ${body.length} row(s) to an anonymous request` : `HTTP ${status}`,
  );
}

// 3. A signed-out neighbour can still post a job.
const posted = await rest('rpc/post_job', {
  method: 'POST',
  body: JSON.stringify({
    p_service: 'Yard work',
    p_name: 'Setup Check',
    p_phone: '0000000000',
    p_email: '',
    p_address: '1 Test St, Arlington Heights',
    p_scheduled_for: '',
    p_budget: '',
    p_details: 'Created by scripts/verify-backend.mjs — safe to reject.',
  }),
});
const jobId = typeof posted.body === 'string' ? posted.body : null;
check('a signed-out neighbour can post a job', posted.status === 200 && Boolean(jobId), `HTTP ${posted.status}`);

// 4. ...and cannot read it back, or anyone else's.
if (jobId) {
  const { body } = await rest(`jobs?select=name,address&id=eq.${jobId}`);
  check(
    'the poster cannot read job rows back',
    !(Array.isArray(body) && body.length > 0),
    Array.isArray(body) && body.length ? 'LEAK: job details readable anonymously' : '',
  );
}

// 5. Claiming a job requires being a signed-in butler.
const claim = await rest('rpc/accept_job', {
  method: 'POST',
  body: JSON.stringify({ p_job_id: jobId ?? '00000000-0000-0000-0000-000000000000' }),
});
check('claiming a job requires signing in', claim.status >= 400, `HTTP ${claim.status}`);

// 6. Edge functions are deployed. Unauthenticated calls should be
//    rejected, not 404 — a 404 means the function was never deployed.
for (const fn of ['notify-butlers', 'job-confirmed', 'send-reminders', 'invite-admin']) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  check(`edge function "${fn}" is deployed`, res.status !== 404, `HTTP ${res.status}`);
  if (res.status !== 404) {
    check(`edge function "${fn}" rejects unauthorised calls`, res.status >= 400, `HTTP ${res.status}`);
  }
}

console.log(
  failures
    ? `\n${failures} check(s) failed. Work through SETUP.md again — the failing line names the step.`
    : '\nAll checks passed. Reject the "Setup Check" job in the admin dashboard when you are done.',
);
process.exit(failures ? 1 : 0);
