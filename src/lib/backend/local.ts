/*
 * Community Butler — browser-only data layer.
 *
 * This is the fallback used when no Supabase project is configured. It
 * persists to localStorage in the current browser only:
 *   - Data does not sync across devices or browsers. A job a neighbour
 *     posts on their phone is invisible to the admin dashboard on yours.
 *   - Nothing can be notified or emailed, because nothing leaves the
 *     device the form was filled in on.
 *   - Admin "auth" is an allowlist checked in the browser. Anyone who
 *     reads the shipped JavaScript can see how the check works.
 *
 * It exists so the site keeps working before the backend is set up, and
 * so local development needs no credentials. It is not the real thing —
 * see SETUP.md.
 */

import type {
  ActivityEntry,
  Admin,
  AdminSession,
  Backend,
  Butler,
  ButlerStats,
  Job,
  JobStatus,
  NewButlerInput,
  NewJobInput,
  SignInResult,
} from './types';

interface LocalAdmin extends Admin {
  password: string;
}

const KEYS = {
  jobs: 'cb.jobs.v1',
  butlers: 'cb.butlers.v1',
  session: 'cb.adminSession.v1',
  butlerSession: 'cb.butlerSession.v1',
  admins: 'cb.admins.v1',
  activity: 'cb.activity.v1',
} as const;

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const ACTIVITY_LIMIT = 200;

interface StoredAdminSession {
  email: string;
  expiresAt: number;
}

interface StoredButlerSession {
  butlerId: string;
  expiresAt: number;
}

function uid(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — fail silently */
  }
}

// ---------- activity log ----------

function activity(): ActivityEntry[] {
  return read<ActivityEntry[]>(KEYS.activity, []);
}

function logActivity(message: string): void {
  const entries = activity();
  entries.unshift({ id: uid(), message, at: new Date().toISOString() });
  write(KEYS.activity, entries.slice(0, ACTIVITY_LIMIT));
}

// ---------- jobs ----------

function jobs(): Job[] {
  return read<Job[]>(KEYS.jobs, []);
}

function patchJob(id: string, patch: Partial<Job>): Job[] {
  const all = jobs();
  const idx = all.findIndex((j) => j.id === id);
  if (idx > -1) {
    all[idx] = { ...all[idx], ...patch };
    write(KEYS.jobs, all);
  }
  return all;
}

// ---------- butlers ----------

function butlers(): Butler[] {
  return read<Butler[]>(KEYS.butlers, []);
}

function notifyButler(id: string, message: string): void {
  const all = butlers();
  const idx = all.findIndex((b) => b.id === id);
  if (idx > -1) {
    all[idx].notifications = all[idx].notifications || [];
    all[idx].notifications.unshift({ message, at: new Date().toISOString(), read: false });
    write(KEYS.butlers, all);
  }
}

// ---------- admins ----------

/*
 * The seed password is deliberately a throwaway. An earlier version of
 * this file hardcoded a real one, which meant publishing it to a public
 * repository on every deploy. Set VITE_LOCAL_ADMIN_PASSWORD to change it
 * for local use; the hosted backend uses Supabase Auth and ignores this
 * entirely.
 */
const SEED_ADMIN_EMAIL = import.meta.env.VITE_LOCAL_ADMIN_EMAIL || 'pbgalley@icloud.com';
const SEED_ADMIN_PASSWORD = import.meta.env.VITE_LOCAL_ADMIN_PASSWORD || 'butler';

function seedAdmins(): LocalAdmin[] {
  const seeded: LocalAdmin[] = [
    {
      id: uid(),
      email: SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      addedAt: new Date().toISOString(),
    },
  ];
  write(KEYS.admins, seeded);
  return seeded;
}

function admins(): LocalAdmin[] {
  const stored = read<LocalAdmin[] | null>(KEYS.admins, null);
  return stored && stored.length ? stored : seedAdmins();
}

function publicAdmin(a: LocalAdmin): Admin {
  return { id: a.id, email: a.email, addedAt: a.addedAt };
}

function currentButlerId(): string | null {
  const session = read<StoredButlerSession | null>(KEYS.butlerSession, null);
  return session && session.expiresAt > Date.now() ? session.butlerId : null;
}

export const local: Backend = {
  kind: 'local',

  async getActivity() {
    return activity();
  },

  async getJobs() {
    return jobs();
  },

  async addJob(data: NewJobInput) {
    const all = jobs();
    const job: Job = {
      id: uid(),
      submittedAt: new Date().toISOString(),
      status: 'New',
      rejectNote: '',
      assignedButlerId: null,
      assignedAt: null,
      completedAt: null,
      ...data,
    };
    all.unshift(job);
    write(KEYS.jobs, all);
    logActivity(`New job request: ${job.service || 'Job'} from ${job.name || 'a neighbor'}`);
    return job;
  },

  async approveJob(id: string) {
    const all = patchJob(id, { status: 'Approved' });
    const job = all.find((j) => j.id === id);
    if (job) logActivity(`Approved job: ${job.service || 'Job'} for ${job.name}`);
  },

  async rejectJob(id: string, note: string) {
    const all = patchJob(id, { status: 'Rejected', rejectNote: note || '' });
    const job = all.find((j) => j.id === id);
    if (job) logActivity(`Rejected job: ${job.service || 'Job'} for ${job.name}`);
  },

  async completeJob(id: string, rating?: number) {
    const patch: Partial<Job> = { status: 'Completed', completedAt: new Date().toISOString() };
    if (rating) patch.rating = Math.min(5, Math.max(1, Math.round(rating)));
    const all = patchJob(id, patch);
    const job = all.find((j) => j.id === id);
    const butler = job?.assignedButlerId
      ? butlers().find((b) => b.id === job.assignedButlerId)
      : null;
    if (job) {
      logActivity(
        `Completed job: ${job.service || 'Job'}${butler ? ` by ${butler.name}` : ''}${
          patch.rating ? ` — rated ${patch.rating}★` : ''
        }`,
      );
    }
  },

  async assignJob(id: string, butlerId: string, notifyMessage?: string) {
    const all = patchJob(id, {
      status: 'Assigned',
      assignedButlerId: butlerId,
      assignedAt: new Date().toISOString(),
    });
    if (butlerId && notifyMessage) notifyButler(butlerId, notifyMessage);
    const job = all.find((j) => j.id === id);
    const butler = butlers().find((b) => b.id === butlerId);
    if (job && butler) logActivity(`Assigned ${job.service || 'job'} to ${butler.name}`);
  },

  // Guards against the job having been taken in the moment between
  // rendering the list and clicking. Two tabs on one device can still
  // race here; the hosted backend settles that in the database.
  async acceptJob(id: string, butlerId: string) {
    const job = jobs().find((j) => j.id === id);
    if (!job || job.status !== 'Approved' || job.assignedButlerId) return false;
    patchJob(id, {
      status: 'Assigned',
      assignedButlerId: butlerId,
      assignedAt: new Date().toISOString(),
      acceptedBySelf: true,
    });
    const butler = butlers().find((b) => b.id === butlerId);
    if (butler) logActivity(`${butler.name} accepted ${job.service || 'a job'}`);
    return true;
  },

  // Open jobs a Butler can take: admin-approved, not yet claimed. Jobs
  // matching their own service area or job-type prefs sort first.
  async getAvailableJobsForButler(butlerId: string) {
    const butler = butlers().find((b) => b.id === butlerId);
    const prefs = butler?.jobTypePrefs ?? [];
    const area = (butler?.serviceArea ?? '').trim().toLowerCase();

    const score = (j: Job) =>
      (prefs.includes(j.service) ? 2 : 0) + (area && j.address.toLowerCase().includes(area) ? 1 : 0);

    return jobs()
      .filter((j) => j.status === 'Approved' && !j.assignedButlerId)
      .sort((a, b) => score(b) - score(a) || +new Date(b.submittedAt) - +new Date(a.submittedAt));
  },

  async getMyJobsForButler(butlerId: string) {
    return jobs()
      .filter((j) => j.assignedButlerId === butlerId)
      .sort(
        (a, b) =>
          +new Date(b.assignedAt || b.submittedAt) - +new Date(a.assignedAt || a.submittedAt),
      );
  },

  async getButlers() {
    return butlers();
  },

  // The password is ignored here. Local mode has no account system worth
  // the name — signing in just looks you up by contact on the device you
  // signed up on. Supabase Auth handles this properly in hosted mode.
  async addButler(data: NewButlerInput) {
    const all = butlers();
    const butler: Butler = {
      id: uid(),
      signedUpAt: new Date().toISOString(),
      notifications: [],
      ...data,
    };
    all.unshift(butler);
    write(KEYS.butlers, all);
    write<StoredButlerSession>(KEYS.butlerSession, {
      butlerId: butler.id,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    logActivity(`${butler.name} signed up as a Butler`);
    return butler;
  },

  // Admin-only view of how active a Butler is. Never shown to the Butler.
  async getButlerStats(butlerId: string): Promise<ButlerStats> {
    const mine = jobs().filter((j) => j.assignedButlerId === butlerId);
    const completed = mine.filter((j) => j.status === 'Completed');
    const rated = completed.filter((j) => typeof j.rating === 'number');
    return {
      jobsAssigned: mine.length,
      jobsCompleted: completed.length,
      avgRating: rated.length
        ? rated.reduce((sum, j) => sum + (j.rating ?? 0), 0) / rated.length
        : null,
      ratedJobs: rated.length,
    };
  },

  async getAdmins() {
    return admins().map(publicAdmin);
  },

  async addAdmin(email: string, password: string) {
    const all = admins();
    all.push({ id: uid(), email: email.trim(), password, addedAt: new Date().toISOString() });
    write(KEYS.admins, all);
    logActivity(`Added admin: ${email.trim()}`);
  },

  async changeAdminPassword(email: string, currentPassword: string, newPassword: string) {
    const all = admins();
    const normalized = email.trim().toLowerCase();
    const admin = all.find((a) => a.email.toLowerCase() === normalized);
    if (!admin || admin.password !== currentPassword) return false;
    admin.password = newPassword;
    write(KEYS.admins, all);
    logActivity(`Updated password: ${admin.email}`);
    return true;
  },

  async adminLogin(email: string, password: string) {
    const normalized = (email || '').trim().toLowerCase();
    const match = admins().find(
      (a) => a.email.toLowerCase() === normalized && a.password === password,
    );
    if (!match) return false;
    write<StoredAdminSession>(KEYS.session, {
      email: match.email,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return true;
  },

  async getAdminSession(): Promise<AdminSession | null> {
    const session = read<StoredAdminSession | null>(KEYS.session, null);
    return session && session.expiresAt > Date.now() ? { email: session.email } : null;
  },

  async adminLogout() {
    try {
      localStorage.removeItem(KEYS.session);
    } catch {
      /* ignore */
    }
  },

  async signIn(contact: string, password: string): Promise<SignInResult> {
    const normalized = (contact || '').trim().toLowerCase();

    const admin = admins().find(
      (a) => a.email.toLowerCase() === normalized && a.password === password,
    );
    if (admin) {
      write<StoredAdminSession>(KEYS.session, {
        email: admin.email,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      return { kind: 'admin' };
    }

    // The password is ignored for butlers here — see addButler.
    const butler = butlers().find((b) => b.contact.trim().toLowerCase() === normalized);
    if (!butler) return { kind: 'unknown' };
    write<StoredButlerSession>(KEYS.butlerSession, {
      butlerId: butler.id,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return { kind: 'butler', butler };
  },

  async getCurrentButler() {
    const id = currentButlerId();
    if (!id) return null;
    return butlers().find((b) => b.id === id) ?? null;
  },

  async butlerLogout() {
    try {
      localStorage.removeItem(KEYS.butlerSession);
    } catch {
      /* ignore */
    }
  },
};

export type { JobStatus };
