/*
 * The day-before reminder.
 *
 * Runs on a schedule (see the pg_cron block in schema.sql), finds every
 * assigned job happening tomorrow, and reminds both sides: an email and a
 * push to the neighbour, a push to the butler who took it.
 *
 * There is no user behind a scheduled run, so it authenticates with a
 * shared secret instead of a session.
 *
 * "Tomorrow" is worked out in the neighbourhood's own timezone. Using UTC
 * would send Saturday's reminder on Thursday evening for anyone west of
 * Greenwich — including Illinois, where this runs.
 */
import { json, preflight } from '../_shared/http.ts';
import { requireCronSecret, serviceClient } from '../_shared/supabase.ts';
import { sendPush, type PushSubscriptionRow } from '../_shared/push.ts';
import { sendEmail } from '../_shared/email.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://blaisegalley.github.io/Community-butler-/';
const TIMEZONE = Deno.env.get('APP_TIMEZONE') ?? 'America/Chicago';

/** Today's date in TIMEZONE, plus `offsetDays`, as 'YYYY-MM-DD'. */
function localDate(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const shifted = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

function readableDate(value: string): string {
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

  const forbidden = requireCronSecret(req);
  if (forbidden) return forbidden;

  const db = serviceClient();
  const tomorrow = localDate(1);

  const { data: jobs, error } = await db
    .from('jobs')
    .select('id,service,name,email,address,scheduled_for,assigned_butler_id')
    .eq('status', 'Assigned')
    .eq('scheduled_for', tomorrow)
    .is('reminder_sent_at', null);
  if (error) return json({ error: error.message }, 500);
  if (!jobs?.length) return json({ ok: true, date: tomorrow, reminded: 0 });

  const day = readableDate(tomorrow);
  let reminded = 0;

  for (const job of jobs) {
    const firstName = (job.name || '').split(' ')[0] || 'there';

    await sendEmail({
      to: job.email,
      subject: `Reminder: your ${job.service || 'job'} is tomorrow`,
      heading: `Your ${job.service || 'job'} is tomorrow`,
      lines: [
        `Hi ${firstName},`,
        `Just a reminder that your ${job.service || 'job'} is booked for ${day}.`,
        `Address on file: ${job.address}`,
        'Need to move it? Reply to this email or call (224) 633-9328 and we will sort it out.',
      ],
      footnote: 'Community Butler · Arlington Heights, IL',
    });

    const { data: neighbourSubs } = await db
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('job_id', job.id);
    await sendPush((neighbourSubs ?? []) as PushSubscriptionRow[], {
      title: `Your ${job.service || 'job'} is tomorrow`,
      body: `Booked for ${day} at ${job.address}.`,
      url: APP_URL,
      tag: `reminder-${job.id}`,
    });

    if (job.assigned_butler_id) {
      const { data: butlerSubs } = await db
        .from('push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('butler_id', job.assigned_butler_id);
      await sendPush((butlerSubs ?? []) as PushSubscriptionRow[], {
        title: `You have a job tomorrow`,
        body: `${job.service || 'A job'} on ${day} at ${job.address}.`,
        url: `${APP_URL.replace(/\/$/, '')}/auth/`,
        tag: `reminder-butler-${job.id}`,
      });
    }

    // Marked one job at a time. If this run dies halfway through, the
    // next one picks up where it stopped instead of re-sending to
    // everyone who already heard from us.
    await db.from('jobs').update({ reminder_sent_at: new Date().toISOString() }).eq('id', job.id);
    reminded += 1;
  }

  return json({ ok: true, date: tomorrow, reminded });
});
