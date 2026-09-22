/*
 * Tells the neighbour their job is confirmed.
 *
 * Runs when a job is assigned to a butler — the point at which someone is
 * actually coming. Sends an email and, if the neighbour turned on
 * notifications when they booked, a push notification too.
 *
 * confirmation_sent_at is set on the way out and checked on the way in, so
 * a retry or a second click cannot send the same neighbour two emails.
 */
import { json, preflight } from '../_shared/http.ts';
import { requireAdmin, serviceClient } from '../_shared/supabase.ts';
import { sendPush, type PushSubscriptionRow } from '../_shared/push.ts';
import { sendEmail } from '../_shared/email.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://thecommunitybutler.com/';

function readableDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  let jobId: string;
  try {
    ({ jobId } = await req.json());
  } catch {
    return json({ error: 'Expected { jobId }' }, 400);
  }
  if (!jobId) return json({ error: 'Expected { jobId }' }, 400);

  const db = serviceClient();

  const { data: job, error } = await db
    .from('jobs')
    .select('id,service,name,email,address,scheduled_for,status,assigned_butler_id,confirmation_sent_at')
    .eq('id', jobId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!job) return json({ error: 'No such job' }, 404);
  if (job.status !== 'Assigned') return json({ skipped: 'Job is not assigned' }, 200);
  if (job.confirmation_sent_at) return json({ skipped: 'Already confirmed' }, 200);

  const { data: butler } = job.assigned_butler_id
    ? await db.from('butlers').select('name').eq('id', job.assigned_butler_id).maybeSingle()
    : { data: null };

  const day = readableDate(job.scheduled_for);
  const who = butler?.name ?? 'one of our Butlers';
  const firstName = (job.name || '').split(' ')[0] || 'there';

  const emailed = await sendEmail({
    to: job.email,
    subject: `Your ${job.service || 'job'} is confirmed`,
    heading: 'Your job is confirmed',
    lines: [
      `Hi ${firstName},`,
      `${who} is booked for your ${job.service || 'job'}${day ? ` on ${day}` : ''}.`,
      `Address on file: ${job.address}`,
      'We will send you a reminder the day before. If anything changes, just reply to this email or call (224) 633-9328.',
    ],
    footnote: 'Community Butler · Arlington Heights, IL',
  });

  const { data: subscriptions } = await db
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('job_id', job.id);

  const pushed = await sendPush((subscriptions ?? []) as PushSubscriptionRow[], {
    title: 'Your job is confirmed',
    body: `${who} is booked for your ${job.service || 'job'}${day ? ` on ${day}` : ''}.`,
    url: APP_URL,
    tag: `job-${job.id}`,
  });

  // Recorded even if the email bounced: retrying automatically would mean
  // re-sending to everyone else who already got theirs.
  await db.from('jobs').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', job.id);

  return json({ ok: true, emailed, pushed });
});
