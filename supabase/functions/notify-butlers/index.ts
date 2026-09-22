/*
 * Tells every butler that a job just opened up.
 *
 * Called by the admin dashboard the moment a job is approved, which is
 * also the moment it becomes claimable — so the alert and the opportunity
 * arrive together.
 *
 * What the notification says matters. It goes to every butler, including
 * ones who will never claim this job, so it carries the type of work and
 * the rough area only. The neighbour's name, street address and phone
 * number stay behind the sign-in, where the butler who actually takes the
 * job can see them.
 */
import { json, preflight } from '../_shared/http.ts';
import { requireAdmin, serviceClient } from '../_shared/supabase.ts';
import { sendPush, type PushSubscriptionRow } from '../_shared/push.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://thecommunitybutler.com/';

/** "12 Maple St, Arlington Heights" -> "Arlington Heights". Falls back to nothing. */
function coarseArea(address: string): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
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

  const { data: job, error: jobError } = await db
    .from('jobs')
    .select('id,service,address,status,assigned_butler_id,scheduled_for')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) return json({ error: jobError.message }, 500);
  if (!job) return json({ error: 'No such job' }, 404);

  // Only an open job is worth announcing. Re-running this on an assigned
  // job would send every butler after work that is already taken.
  if (job.status !== 'Approved' || job.assigned_butler_id) {
    return json({ skipped: 'Job is not open', status: job.status }, 200);
  }

  const { data: subscriptions } = await db
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .not('butler_id', 'is', null);

  const area = coarseArea(job.address);
  const when = job.scheduled_for ? ` · ${job.scheduled_for}` : '';

  const result = await sendPush((subscriptions ?? []) as PushSubscriptionRow[], {
    title: 'New job available',
    body: `${job.service || 'A job'}${area ? ` in ${area}` : ''}${when} — open the app to claim it.`,
    url: `${APP_URL.replace(/\/$/, '')}/auth/`,
    // One tag per job, so re-approving replaces the old alert.
    tag: `job-${job.id}`,
  });

  // The in-app list is the record for butlers who have notifications off,
  // or whose phone was asleep when this went out.
  const { data: butlers } = await db.from('butlers').select('id');
  if (butlers?.length) {
    await db.from('butler_notifications').insert(
      butlers.map((butler: { id: string }) => ({
        butler_id: butler.id,
        message: `New job available: ${job.service || 'a job'}${area ? ` in ${area}` : ''}.`,
      })),
    );
  }

  return json({ ok: true, ...result });
});
