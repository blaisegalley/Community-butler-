/*
 * Community Butler — client-side data layer.
 *
 * IMPORTANT: this project is a static site with no backend yet, so this
 * store persists to localStorage in the current browser only. It is a
 * working MVP, not production infrastructure:
 *   - Data does not sync across devices/browsers.
 *   - Admin "auth" below is a fixed allowlist checked in the browser —
 *     fine for keeping casual visitors out, but anyone who reads this
 *     file's source can see the checking logic. Do not reuse these
 *     passwords anywhere real, and swap in real backend auth (and a
 *     real database) before this becomes a real operational tool.
 *
 * Update ADMIN_ALLOWLIST below with the real admin emails/passwords.
 */

export type JobStatus = 'New' | 'Approved' | 'Assigned' | 'Completed' | 'Rejected';

export interface Job {
  id: string;
  service: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  date: string;
  budget: string;
  details: string;
  submittedAt: string;
  status: JobStatus;
  rejectNote: string;
  assignedButlerId: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  acceptedBySelf?: boolean;
  // Where this request came from — captured from ?utm_source/?utm_campaign on
  // /request at submit time. "direct" when neither param was present.
  source: string;
  utmCampaign: string;
}

export type NewJobInput = Pick<
  Job,
  'service' | 'name' | 'phone' | 'email' | 'address' | 'date' | 'budget' | 'details'
> &
  Partial<Pick<Job, 'source' | 'utmCampaign'>>;

export interface ButlerNotification {
  message: string;
  at: string;
  read: boolean;
}

export interface Butler {
  id: string;
  name: string;
  contact: string;
  serviceArea: string;
  jobTypePrefs: string[];
  signedUpAt: string;
  notifications: ButlerNotification[];
}

export type NewButlerInput = Pick<Butler, 'name' | 'contact' | 'serviceArea' | 'jobTypePrefs'>;

interface AdminAccount {
  email: string;
  password: string;
}

interface AdminSession {
  email: string;
  expiresAt: number;
}

interface ButlerSession {
  butlerId: string;
  expiresAt: number;
}

const KEYS = {
  jobs: 'cb.jobs.v1',
  butlers: 'cb.butlers.v1',
  session: 'cb.adminSession.v1',
  butlerSession: 'cb.butlerSession.v1',
} as const;

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Replace with the real 3 admin accounts before launch.
const ADMIN_ALLOWLIST: AdminAccount[] = [
  { email: 'admin1@communitybutler.com', password: 'Butler-Admin-1!' },
  { email: 'admin2@communitybutler.com', password: 'Butler-Admin-2!' },
  { email: 'admin3@communitybutler.com', password: 'Butler-Admin-3!' },
];

export function uid(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — fail silently */
  }
}

// ---------- jobs ----------

export function getJobs(): Job[] {
  return read<Job[]>(KEYS.jobs, []);
}

export function addJob(data: NewJobInput): Job {
  const jobs = getJobs();
  const job: Job = {
    id: uid(),
    submittedAt: new Date().toISOString(),
    status: 'New',
    rejectNote: '',
    assignedButlerId: null,
    assignedAt: null,
    completedAt: null,
    source: 'direct',
    utmCampaign: '',
    ...data,
  };
  jobs.unshift(job);
  write(KEYS.jobs, jobs);
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job[] {
  const jobs = getJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx > -1) {
    jobs[idx] = { ...jobs[idx], ...patch };
    write(KEYS.jobs, jobs);
  }
  return jobs;
}

export function approveJob(id: string): Job[] {
  return updateJob(id, { status: 'Approved' });
}

export function rejectJob(id: string, note: string): Job[] {
  return updateJob(id, { status: 'Rejected', rejectNote: note || '' });
}

export function completeJob(id: string): Job[] {
  return updateJob(id, { status: 'Completed', completedAt: new Date().toISOString() });
}

export function assignJob(id: string, butlerId: string, notifyMessage?: string): Job[] {
  const jobs = updateJob(id, {
    status: 'Assigned',
    assignedButlerId: butlerId,
    assignedAt: new Date().toISOString(),
  });
  if (butlerId && notifyMessage) {
    notifyButler(butlerId, notifyMessage);
  }
  return jobs;
}

// A Butler claiming an open job themselves — same end state as assignJob,
// but guards against the job having been taken (by admin or another
// Butler/tab) in the moment between rendering the list and clicking.
export function acceptJob(id: string, butlerId: string): boolean {
  const job = getJobs().find((j) => j.id === id);
  if (!job || job.status !== 'Approved' || job.assignedButlerId) {
    return false;
  }
  updateJob(id, {
    status: 'Assigned',
    assignedButlerId: butlerId,
    assignedAt: new Date().toISOString(),
    acceptedBySelf: true,
  });
  return true;
}

// Open jobs a Butler can take: admin-approved, not yet claimed by anyone.
// Jobs matching the Butler's own service area or job-type prefs sort first.
export function getAvailableJobsForButler(butlerId: string): Job[] {
  const butler = getButlers().find((b) => b.id === butlerId);
  const prefs = butler?.jobTypePrefs ?? [];
  const area = (butler?.serviceArea ?? '').trim().toLowerCase();

  const score = (j: Job) =>
    (prefs.includes(j.service) ? 2 : 0) + (area && j.address.toLowerCase().includes(area) ? 1 : 0);

  return getJobs()
    .filter((j) => j.status === 'Approved' && !j.assignedButlerId)
    .sort((a, b) => score(b) - score(a) || +new Date(b.submittedAt) - +new Date(a.submittedAt));
}

export function getMyJobsForButler(butlerId: string): Job[] {
  return getJobs()
    .filter((j) => j.assignedButlerId === butlerId)
    .sort(
      (a, b) =>
        +new Date(b.assignedAt || b.submittedAt) - +new Date(a.assignedAt || a.submittedAt),
    );
}

// ---------- butlers ----------

export function getButlers(): Butler[] {
  return read<Butler[]>(KEYS.butlers, []);
}

export function addButler(data: NewButlerInput): Butler {
  const butlers = getButlers();
  const butler: Butler = {
    id: uid(),
    signedUpAt: new Date().toISOString(),
    notifications: [],
    ...data,
  };
  butlers.unshift(butler);
  write(KEYS.butlers, butlers);
  return butler;
}

export function notifyButler(id: string, message: string): void {
  const butlers = getButlers();
  const idx = butlers.findIndex((b) => b.id === id);
  if (idx > -1) {
    butlers[idx].notifications = butlers[idx].notifications || [];
    butlers[idx].notifications.unshift({ message, at: new Date().toISOString(), read: false });
    write(KEYS.butlers, butlers);
  }
}

// ---------- admin session ----------

export function adminLogin(email: string, password: string): boolean {
  const normalized = (email || '').trim().toLowerCase();
  const match = ADMIN_ALLOWLIST.find(
    (a) => a.email.toLowerCase() === normalized && a.password === password,
  );
  if (!match) return false;
  write<AdminSession>(KEYS.session, { email: match.email, expiresAt: Date.now() + SESSION_TTL_MS });
  return true;
}

export function getAdminSession(): AdminSession | null {
  const session = read<AdminSession | null>(KEYS.session, null);
  return session && session.expiresAt > Date.now() ? session : null;
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminSession();
}

export function adminLogout(): void {
  try {
    localStorage.removeItem(KEYS.session);
  } catch {
    /* ignore */
  }
}

// ---------- Butler session ----------
// Signing up logs a Butler in immediately (we just created the record).
// "Signing in" on a device that never signed up won't find anything —
// there's no backend, so accounts don't sync across devices/browsers.

export function butlerLoginById(id: string): void {
  write<ButlerSession>(KEYS.butlerSession, { butlerId: id, expiresAt: Date.now() + SESSION_TTL_MS });
}

export function butlerLoginByContact(contact: string): Butler | null {
  const normalized = (contact || '').trim().toLowerCase();
  const match = getButlers().find((b) => b.contact.trim().toLowerCase() === normalized);
  if (!match) return null;
  butlerLoginById(match.id);
  return match;
}

export function getButlerSession(): ButlerSession | null {
  const session = read<ButlerSession | null>(KEYS.butlerSession, null);
  return session && session.expiresAt > Date.now() ? session : null;
}

export function getCurrentButler(): Butler | null {
  const session = getButlerSession();
  if (!session) return null;
  return getButlers().find((b) => b.id === session.butlerId) ?? null;
}

export function butlerLogout(): void {
  try {
    localStorage.removeItem(KEYS.butlerSession);
  } catch {
    /* ignore */
  }
}
