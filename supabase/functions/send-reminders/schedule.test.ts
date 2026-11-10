import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminder, localDate, zonedToInstant, type JobRow } from './schedule.ts';

const TZ = 'America/Chicago';
const HOUR = 3_600_000;

function job(over: Partial<JobRow>): JobRow {
  return {
    id: 'j', service: 'Yard work', name: 'Ann Lee', email: 'a@example.com', phone: '', address: '1 Elm St',
    scheduled_for: '2026-11-14', scheduled_time: '14:30', assigned_butler_id: 'b',
    reminder_sent_at: null, hour_reminder_sent_at: null, ...over,
  };
}

test('wall-clock time in Chicago maps to the right instant, either side of daylight saving', () => {
  // CST is UTC-6 in November, CDT is UTC-5 in July.
  assert.equal(zonedToInstant('2026-11-14', '14:30', TZ).toISOString(), '2026-11-14T20:30:00.000Z');
  assert.equal(zonedToInstant('2026-07-04', '09:00', TZ).toISOString(), '2026-07-04T14:00:00.000Z');
  // The morning clocks go back (Nov 1 2026): 09:00 that day is already CST.
  assert.equal(zonedToInstant('2026-11-01', '09:00', TZ).toISOString(), '2026-11-01T15:00:00.000Z');
});

test('local date rolls over at local midnight, not UTC midnight', () => {
  // 11pm in Chicago on the 13th is already the 14th in UTC.
  const lateEvening = new Date('2026-11-14T05:00:00Z');
  assert.equal(localDate(lateEvening, TZ, 0), '2026-11-13');
  assert.equal(localDate(lateEvening, TZ, 1), '2026-11-14');
});

const start = +new Date('2026-11-14T20:30:00Z'); // 2:30pm Chicago

test('day reminder is due within 24h of the start, and not too close to it', () => {
  assert.equal(dueReminder(job({}), new Date(start - 25 * HOUR), TZ), null);
  assert.equal(dueReminder(job({}), new Date(start - 23.9 * HOUR), TZ), 'day');
  assert.equal(dueReminder(job({}), new Date(start - 3 * HOUR), TZ), 'day');
  // Under two hours out the hour reminder is about to go; skip the day one.
  assert.equal(dueReminder(job({}), new Date(start - 1.5 * HOUR), TZ), null);
});

test('hour reminder is due in the last hour, once, and never after the start', () => {
  assert.equal(dueReminder(job({ reminder_sent_at: 'x' }), new Date(start - 61 * 60_000), TZ), null);
  assert.equal(dueReminder(job({ reminder_sent_at: 'x' }), new Date(start - 55 * 60_000), TZ), 'hour');
  assert.equal(dueReminder(job({ reminder_sent_at: 'x', hour_reminder_sent_at: 'x' }), new Date(start - 30 * 60_000), TZ), null);
  assert.equal(dueReminder(job({}), new Date(start + 60_000), TZ), null);
});

test('a job booked at short notice still gets its hour reminder', () => {
  assert.equal(dueReminder(job({}), new Date(start - 20 * 60_000), TZ), 'hour');
});

test('a date with no time gets only a day reminder, from 9am the day before', () => {
  const dateOnly = job({ scheduled_time: '' });
  assert.equal(dueReminder(dateOnly, new Date('2026-11-13T14:00:00Z'), TZ), null); // 8am Chicago on the 13th
  assert.equal(dueReminder(dateOnly, new Date('2026-11-13T15:10:00Z'), TZ), 'day'); // 9:10am
  assert.equal(dueReminder(dateOnly, new Date('2026-11-14T15:10:00Z'), TZ), null); // the day itself
  assert.equal(dueReminder(job({ scheduled_time: '', reminder_sent_at: 'x' }), new Date('2026-11-13T15:10:00Z'), TZ), null);
});

test('jobs with no usable date are skipped', () => {
  assert.equal(dueReminder(job({ scheduled_for: '' }), new Date(start - HOUR / 2), TZ), null);
  assert.equal(dueReminder(job({ scheduled_for: 'next Tuesday' }), new Date(start - HOUR / 2), TZ), null);
});
