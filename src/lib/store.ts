/*
 * Community Butler — the app's data layer.
 *
 * Everything the UI does to data goes through here. Under it sits one of
 * two backends:
 *
 *   remote — a Supabase project. Jobs, butlers and admins are shared, so
 *            the admin dashboard sees what neighbours post from their own
 *            phones, and the notification jobs have something to read.
 *   local  — this browser's localStorage. No sharing, and therefore no
 *            notifications or emails. Used when no project is configured,
 *            so the site still works and local development needs no keys.
 *
 * Which one is in use is decided once, by whether the Supabase environment
 * variables were present at build time.
 *
 * Every function is async. Callers should render a loading state rather
 * than assume data is already there — useQuery below does that for them.
 */

import { isBackendConfigured } from '@/lib/backendConfig';
import { local } from './backend/local';
import type { Backend } from './backend/types';

import type {
  ActivityEntry,
  Admin,
  AdminSession,
  Butler,
  ButlerStats,
  Job,
  NewButlerInput,
  NewJobInput,
  SignInResult,
} from './backend/types';

export type {
  ActivityEntry,
  Admin,
  AdminSession,
  Butler,
  ButlerNotification,
  ButlerStats,
  Job,
  JobStatus,
  NewButlerInput,
  NewJobInput,
  SignInResult,
} from './backend/types';

/** True when data is shared across devices — and so when alerts can work. */
export const isShared = isBackendConfigured();

/*
 * The Supabase client is ~230KB of JavaScript that the homepage never
 * needs: a visitor reading the page touches no data until they open a
 * form, and in local mode the client is never used at all. Importing it
 * dynamically keeps it out of the main bundle and off the critical path.
 */
let remoteBackend: Promise<Backend> | null = null;

function backend(): Backend | Promise<Backend> {
  if (!isShared) return local;
  if (!remoteBackend) {
    remoteBackend = import('./backend/remote').then((module) => module.remote);
  }
  return remoteBackend;
}

// ---------- change notification ----------
//
// A mutation anywhere should refresh every view that reads the same data,
// without those views having to know about each other.

const listeners = new Set<() => void>();

export function onStoreChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

// ---------- reads ----------
//
// Each of these is a one-line pass-through with its type written out.
// A clever generic forwarder loses the return types, and a dashboard that
// silently types its job list as `any` is worse than a little repetition.

export const getActivity = async (): Promise<ActivityEntry[]> => (await backend()).getActivity();
export const getJobs = async (): Promise<Job[]> => (await backend()).getJobs();
export const getButlers = async (): Promise<Butler[]> => (await backend()).getButlers();
export const getAdmins = async (): Promise<Admin[]> => (await backend()).getAdmins();

export const getButlerStats = async (butlerId: string): Promise<ButlerStats> =>
  (await backend()).getButlerStats(butlerId);
export const getAvailableJobsForButler = async (butlerId: string): Promise<Job[]> =>
  (await backend()).getAvailableJobsForButler(butlerId);
export const getMyJobsForButler = async (butlerId: string): Promise<Job[]> =>
  (await backend()).getMyJobsForButler(butlerId);

export const getAdminSession = async (): Promise<AdminSession | null> =>
  (await backend()).getAdminSession();
export const getCurrentButler = async (): Promise<Butler | null> =>
  (await backend()).getCurrentButler();

// ---------- writes ----------
//
// Each one tells every subscriber to refetch, so a change made in one
// place shows up everywhere that reads the same data.

export async function addJob(data: NewJobInput): Promise<Job> {
  const job = await (await backend()).addJob(data);
  emitChange();
  return job;
}

export async function approveJob(id: string): Promise<void> {
  await (await backend()).approveJob(id);
  emitChange();
}

export async function rejectJob(id: string, note: string): Promise<void> {
  await (await backend()).rejectJob(id, note);
  emitChange();
}

export async function completeJob(id: string, rating?: number): Promise<void> {
  await (await backend()).completeJob(id, rating);
  emitChange();
}

export async function assignJob(
  id: string,
  butlerId: string,
  notifyMessage?: string,
): Promise<void> {
  await (await backend()).assignJob(id, butlerId, notifyMessage);
  emitChange();
}

export async function acceptJob(id: string, butlerId: string): Promise<boolean> {
  const claimed = await (await backend()).acceptJob(id, butlerId);
  emitChange();
  return claimed;
}

export async function addButler(data: NewButlerInput, password: string): Promise<Butler> {
  const butler = await (await backend()).addButler(data, password);
  emitChange();
  return butler;
}

export async function addAdmin(email: string, password: string): Promise<void> {
  await (await backend()).addAdmin(email, password);
  emitChange();
}

export async function changeAdminPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const changed = await (await backend()).changeAdminPassword(email, currentPassword, newPassword);
  emitChange();
  return changed;
}

// ---------- sessions ----------

export async function adminLogin(email: string, password: string): Promise<boolean> {
  const ok = await (await backend()).adminLogin(email, password);
  emitChange();
  return ok;
}

export async function adminLogout(): Promise<void> {
  await (await backend()).adminLogout();
  emitChange();
}

export async function signIn(contact: string, password: string): Promise<SignInResult> {
  const result = await (await backend()).signIn(contact, password);
  emitChange();
  return result;
}

export async function butlerLogout(): Promise<void> {
  await (await backend()).butlerLogout();
  emitChange();
}
