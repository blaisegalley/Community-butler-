/*
 * Job reminders: one a day before, one an hour before.
 *
 * Runs every ten minutes on a schedule (see supabase/schedule.sql), finds
 * assigned jobs coming up, and emails both sides — the neighbour who
 * booked it and the butler doing it — plus a push to anyone who turned
 * notifications on.
 *
 * - Day-before: 24 hours before the start time. A job with a date but no
 *   time gets it at 9am the day before instead.
 * - Hour-before: 60 minutes before the start time. Only possible when the
 *   job has a time; the admin page says so on jobs that don't.
 *
 * Each reminder is marked as sent on the job row, one job at a time, so a
 * run that dies halfway, or two runs that overlap, never send twice.
 * Moving a job to a new date or time clears both marks (a trigger in
 * 007_job_time_and_reminders.sql), so the new slot is reminded about too.
 *
 * There is no user behind a scheduled run, so it authenticates with a
 * shared secret instead of a session.
 *
 * Times are the neighbourhood's own (APP_TIMEZONE). Working in UTC would
 * send Saturday's reminder on Thursday evening for anyone in Illinois.
 */
import { json, preflight } from '../_shared/http.ts';
import { requireCronSecret, serviceClient } from '../_shared/supabase.ts';
import { sendPush, type PushSubscriptionRow } from '../_shared/push.ts';
import { sendEmail } from '../_shared/email.ts';
import { dueReminder, localDate, readableDate, readableTime, TIME_RE, type JobRow, type Kind } from './schedule.ts';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://thecommunitybutler.com/').replace(/\/$/, '');
const TIMEZONE = Deno.env.get('APP_TIMEZONE') ?? 'America/Chicago';
const PHONE = '(224) 633-9328';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const forbidden = requireCronSecret(req);
  if (forbidden) return forbidden;

  // Without email set up, every reminder below would be marked as sent
  // without anyone hearing about it. Stop instead, so they all still go
  // out on the first run after the keys are added.
  if (!Deno.env.get('RESEND_API_KEY') || !Deno.env.get('EMAIL_FROM')) {
    return json({ ok: false, error: 'RESEND_API_KEY and EMAIL_FROM are not set; no reminders sent.' }, 503);
  }

  const db = serviceClient();
  const now = new Date();

  // Today and tomorrow cover every reminder this run could owe; anything
  // further out is not due yet, and anything earlier has started.
  const { data, error } = await db
    .from('jobs')
    .select(
      'id,service,name,email,phone,address,scheduled_for,scheduled_time,assigned_butler_id,reminder_sent_at,hour_reminder_sent_at',
    )
    .eq('status', 'Assigned')
    .in('scheduled_for', [localDate(now, TIMEZONE, 0), localDate(now, TIMEZONE, 1)])
    .or('reminder_sent_at.is.null,hour_reminder_sent_at.is.null');
  if (error) return json({ error: error.message }, 500);

  const sent: { job: string; kind: Kind; neighbourEmail: boolean; butlerEmail: boolean }[] = [];

  for (const job of (data ?? []) as JobRow[]) {
    const kind = dueReminder(job, now, TIMEZONE);
    if (!kind) continue;

    const service = job.service || 'job';
    const day = readableDate(job.scheduled_for);
    const at = TIME_RE.test(job.scheduled_time) ? ` at ${readableTime(job.scheduled_time)}` : '';
    const when = kind === 'hour' ? `in about an hour${at ? ` (${at.trim()})` : ''}` : `tomorrow, ${day}${at}`;
    const firstName = (job.name || '').split(' ')[0] || 'there';

    const { data: butler } = job.assigned_butler_id
      ? await db.from('butlers').select('name,contact').eq('id', job.assigned_butler_id).maybeSingle()
      : { data: null };
    const butlerFirst = (butler?.name || '').split(' ')[0] || 'Your butler';
    const butlerEmail = butler?.contact?.includes('@') ? butler.contact.trim() : '';

    // ---- the neighbour who booked it
    const neighbourEmailed = await sendEmail({
      to: job.email,
      subject: kind === 'hour' ? `Your ${service} starts in about an hour` : `Reminder: your ${service} is tomorrow`,
      heading: kind === 'hour' ? `${butlerFirst} is on the way soon` : `Your ${service} is tomorrow`,
      lines: [
        `Hi ${firstName},`,
        kind === 'hour'
          ? `Just a heads-up that your ${service} starts in about an hour${at ? `, at ${at.replace(' at ', '')}` : ''}.`
          : `Just a reminder that your ${service} is booked for ${day}${at}.`,
        `${butlerFirst} from Community Butler will be coming to: ${job.address}`,
        `Need to change anything? Reply to this email or call ${PHONE}.`,
      ],
      footnote: 'Community Butler · Arlington Heights, IL',
    });

    // ---- the butler doing it
    const butlerEmailed = await sendEmail({
      to: butlerEmail,
      subject: kind === 'hour' ? `Your ${service} job starts in about an hour` : `Reminder: you have a ${service} job tomorrow`,
      heading: kind === 'hour' ? 'Time to head out soon' : 'You have a job tomorrow',
      lines: [
        `Hi ${butlerFirst},`,
        kind === 'hour'
          ? `Your ${service} job for ${job.name || 'a neighbor'} starts in about an hour${at ? `, at ${at.replace(' at ', '')}` : ''}.`
          : `You're booked for a ${service} job for ${job.name || 'a neighbor'} on ${day}${at}.`,
        `Address: ${job.address}`,
        ...(job.phone ? [`Their phone: ${job.phone}`] : []),
        `Running late or can't make it? Call ${PHONE} as soon as you can.`,
      ],
      footnote: `See all your jobs: ${APP_URL}/auth/`,
    });

    // If there was someone to email and every email was refused (most
    // likely the sending domain is not verified yet), leave it unmarked so
    // the next run tries again, rather than losing the reminder.
    const hadRecipient = Boolean(job.email) || Boolean(butlerEmail);
    if (hadRecipient && !neighbourEmailed && !butlerEmailed) {
      console.error(`Reminder emails for job ${job.id} were all refused; will retry next run.`);
      continue;
    }

    // Pushes only once the reminder is really going out, so a retried
    // reminder never buzzes anyone's phone twice.
    const { data: neighbourSubs } = await db
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('job_id', job.id);
    await sendPush((neighbourSubs ?? []) as PushSubscriptionRow[], {
      title: kind === 'hour' ? `Your ${service} starts soon` : `Your ${service} is tomorrow`,
      body: `${kind === 'hour' ? 'Starting' : 'Booked for'} ${when} at ${job.address}.`,
      url: `${APP_URL}/`,
      tag: `reminder-${kind}-${job.id}`,
    });

    if (job.assigned_butler_id) {
      const { data: butlerSubs } = await db
        .from('push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('butler_id', job.assigned_butler_id);
      await sendPush((butlerSubs ?? []) as PushSubscriptionRow[], {
        title: kind === 'hour' ? 'Your job starts in about an hour' : 'You have a job tomorrow',
        body: `${service} ${when} at ${job.address}.`,
        url: `${APP_URL}/auth/`,
        tag: `reminder-butler-${kind}-${job.id}`,
      });
    }

    // Marked one job at a time, after sending: a run that dies halfway
    // leaves the rest for the next run instead of skipping them.
    await db
      .from('jobs')
      .update(kind === 'hour' ? { hour_reminder_sent_at: now.toISOString() } : { reminder_sent_at: now.toISOString() })
      .eq('id', job.id);
    sent.push({ job: job.id, kind, neighbourEmail: neighbourEmailed, butlerEmail: butlerEmailed });
  }

  return json({ ok: true, at: now.toISOString(), sent });
});
