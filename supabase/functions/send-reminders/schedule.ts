/*
 * When each job reminder is due. Pure functions with no Deno or network
 * imports, so they can be tested on their own (schedule.test.ts).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** A day-before reminder this close to the start is pointless: the hour one is about to go. */
const DAY_REMINDER_CUTOFF = 2 * HOUR;
/** With no start time, the day-before reminder goes out at this local hour. */
const DATE_ONLY_SEND_HOUR = 9;

/** The wall-clock parts of `instant` in `timeZone`. */
export function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** 'YYYY-MM-DD' for today in `timeZone`, plus `offsetDays`. */
export function localDate(now: Date, timeZone: string, offsetDays = 0): string {
  const { year, month, day } = localParts(now, timeZone);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

/**
 * The instant a 'YYYY-MM-DD' + 'HH:MM' wall-clock time in `timeZone` refers
 * to. Guesses as if it were UTC, measures how far the zone is from that
 * guess, and corrects — twice, so a time either side of a daylight-saving
 * change still lands on the right hour.
 */
export function zonedToInstant(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let instant = wanted;
  for (let i = 0; i < 2; i += 1) {
    const p = localParts(new Date(instant), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    instant += wanted - shown;
  }
  return new Date(instant);
}

export function readableDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function readableTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface JobRow {
  id: string;
  service: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  scheduled_for: string;
  scheduled_time: string;
  assigned_butler_id: string | null;
  reminder_sent_at: string | null;
  hour_reminder_sent_at: string | null;
}

export type Kind = 'day' | 'hour';

/** Which reminder, if any, this job is due right now. */
export function dueReminder(job: JobRow, now: Date, timeZone: string): Kind | null {
  if (!DATE_RE.test(job.scheduled_for)) return null;
  const hasTime = TIME_RE.test(job.scheduled_time);

  if (hasTime) {
    const untilStart = +zonedToInstant(job.scheduled_for, job.scheduled_time, timeZone) - +now;
    // Past the start, nothing more to say.
    if (untilStart <= 0) return null;
    if (!job.hour_reminder_sent_at && untilStart <= HOUR) return 'hour';
    if (!job.reminder_sent_at && untilStart <= 24 * HOUR && untilStart > DAY_REMINDER_CUTOFF) return 'day';
    return null;
  }

  if (job.reminder_sent_at) return null;
  return job.scheduled_for === localDate(now, timeZone, 1) && localParts(now, timeZone).hour >= DATE_ONLY_SEND_HOUR ? 'day' : null;
}
