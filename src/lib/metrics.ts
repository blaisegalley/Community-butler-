/*
 * Everything the dashboard shows, computed in one place.
 *
 * A note on money, because it is the number most likely to be quoted
 * somewhere it matters: Community Butler charges nothing through the
 * site — neighbours settle up with their butler directly. So there is no
 * revenue to report. What there is, is the total value of work that got
 * done, from the budgets neighbours typed when they posted. That is a
 * real and useful number, and it is not the same thing as income. The
 * dashboard labels it as what it is.
 */

import { getJobs, getButlers, type Job, type JobStatus } from '@/lib/store';
import { isBackendConfigured } from '@/lib/backendConfig';

export interface DayPoint {
  day: string;
  posted: number;
  completed: number;
}

export interface ViewDayPoint {
  day: string;
  visitor: number;
  butler: number;
}

export interface Labelled {
  label: string;
  value: number;
}

export interface Metrics {
  rangeDays: number;
  jobsPosted: number;
  jobsCompleted: number;
  completedValue: number;
  valuedJobs: number;
  activeButlers: number;
  totalButlers: number;
  avgRating: number | null;
  ratedJobs: number;
  awaitingApproval: number;
  unclaimed: number;
  medianHoursToApprove: number | null;
  totalViews: number;
  viewsTracked: boolean;
  jobsByDay: DayPoint[];
  viewsByDay: ViewDayPoint[];
  viewsByPath: Labelled[];
  byService: Labelled[];
  byStatus: { status: JobStatus; count: number }[];
  funnel: Labelled[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Budgets come from a free number field, so anything unparseable is zero. */
function budgetOf(job: Job): number {
  const amount = Number.parseFloat((job.budget || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Every day in the window, so a quiet day is a zero rather than a gap. */
function emptyDays(days: number): string[] {
  const out: string[] = [];
  const start = Date.now() - (days - 1) * DAY_MS;
  for (let i = 0; i < days; i += 1) out.push(dayKey(new Date(start + i * DAY_MS)));
  return out;
}

async function loadViews(days: number): Promise<{
  byDay: ViewDayPoint[];
  byPath: Labelled[];
  total: number;
  tracked: boolean;
}> {
  const blank = { byDay: [], byPath: [], total: 0, tracked: false };
  if (!isBackendConfigured()) return blank;

  try {
    const { supabase } = await import('@/lib/supabase');
    const db = supabase();
    const [dayRes, pathRes] = await Promise.all([
      db.rpc('views_by_day', { p_days: days }),
      db.rpc('views_by_path', { p_days: days }),
    ]);
    // The functions only exist once 003_analytics.sql has been run.
    // Until then the dashboard says so rather than showing a flat zero
    // that looks like real traffic data.
    if (dayRes.error || pathRes.error) return blank;

    const byDayMap = new Map<string, ViewDayPoint>();
    for (const day of emptyDays(days)) byDayMap.set(day, { day, visitor: 0, butler: 0 });

    let total = 0;
    for (const row of (dayRes.data ?? []) as { day: string; viewer: string; views: number }[]) {
      const key = dayKey(row.day);
      const point = byDayMap.get(key);
      total += Number(row.views);
      if (!point) continue;
      if (row.viewer === 'butler') point.butler += Number(row.views);
      else if (row.viewer === 'visitor') point.visitor += Number(row.views);
    }

    const pathTotals = new Map<string, number>();
    for (const row of (pathRes.data ?? []) as { path: string; views: number }[]) {
      pathTotals.set(row.path, (pathTotals.get(row.path) ?? 0) + Number(row.views));
    }

    return {
      byDay: [...byDayMap.values()],
      byPath: [...pathTotals.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
      total,
      tracked: true,
    };
  } catch {
    return blank;
  }
}

export async function loadMetrics(rangeDays: number): Promise<Metrics> {
  const since = Date.now() - rangeDays * DAY_MS;
  const [allJobs, butlers, views] = await Promise.all([
    getJobs(),
    getButlers(),
    loadViews(rangeDays),
  ]);

  const inRange = allJobs.filter((j) => +new Date(j.submittedAt) >= since);
  const completed = inRange.filter((j) => j.status === 'Completed');
  const valued = completed.filter((j) => budgetOf(j) > 0);
  const rated = completed.filter((j) => typeof j.rating === 'number');

  const dayMap = new Map<string, DayPoint>();
  for (const day of emptyDays(rangeDays)) dayMap.set(day, { day, posted: 0, completed: 0 });
  for (const job of inRange) {
    const point = dayMap.get(dayKey(job.submittedAt));
    if (point) point.posted += 1;
  }
  for (const job of allJobs) {
    if (!job.completedAt) continue;
    const point = dayMap.get(dayKey(job.completedAt));
    if (point) point.completed += 1;
  }

  const serviceTotals = new Map<string, number>();
  for (const job of inRange) {
    const key = job.service || 'Unspecified';
    serviceTotals.set(key, (serviceTotals.get(key) ?? 0) + 1);
  }

  const statuses: JobStatus[] = ['New', 'Approved', 'Assigned', 'Completed', 'Rejected'];
  const byStatus = statuses.map((status) => ({
    status,
    count: inRange.filter((j) => j.status === status).length,
  }));

  const approvalHours = inRange
    .filter((j) => j.assignedAt)
    .map((j) => (+new Date(j.assignedAt as string) - +new Date(j.submittedAt)) / 3_600_000)
    .filter((h) => h >= 0);

  const activeButlerIds = new Set(
    allJobs
      .filter((j) => j.assignedButlerId && j.assignedAt && +new Date(j.assignedAt) >= since)
      .map((j) => j.assignedButlerId as string),
  );

  const requestViews = views.byPath
    .filter((p) => p.label.includes('request'))
    .reduce((sum, p) => sum + p.value, 0);

  // Only a funnel if the top of it was measured. Starting at "posted"
  // would look like a funnel while hiding the stage that actually tells
  // you whether the site is working.
  const funnel: Labelled[] = views.tracked
    ? [
        { label: 'Visited the request page', value: requestViews },
        { label: 'Posted a job', value: inRange.length },
        { label: 'Approved', value: inRange.filter((j) => j.status !== 'New' && j.status !== 'Rejected').length },
        { label: 'Completed', value: completed.length },
      ]
    : [
        { label: 'Posted a job', value: inRange.length },
        { label: 'Approved', value: inRange.filter((j) => j.status !== 'New' && j.status !== 'Rejected').length },
        { label: 'Completed', value: completed.length },
      ];

  return {
    rangeDays,
    jobsPosted: inRange.length,
    jobsCompleted: completed.length,
    completedValue: valued.reduce((sum, j) => sum + budgetOf(j), 0),
    valuedJobs: valued.length,
    activeButlers: activeButlerIds.size,
    totalButlers: butlers.length,
    avgRating: rated.length
      ? rated.reduce((sum, j) => sum + (j.rating ?? 0), 0) / rated.length
      : null,
    ratedJobs: rated.length,
    awaitingApproval: allJobs.filter((j) => j.status === 'New').length,
    unclaimed: allJobs.filter((j) => j.status === 'Approved' && !j.assignedButlerId).length,
    medianHoursToApprove: median(approvalHours),
    totalViews: views.total,
    viewsTracked: views.tracked,
    jobsByDay: [...dayMap.values()],
    viewsByDay: views.byDay,
    viewsByPath: views.byPath,
    byService: [...serviceTotals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byStatus,
    funnel,
  };
}
