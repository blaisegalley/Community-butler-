/*
 * Community Butler — hosted data layer (Supabase).
 *
 * This is what makes the app an app rather than a form: a job posted on a
 * neighbour's phone lands in one database that the admin dashboard, every
 * butler's phone and the notification jobs all read from.
 *
 * Authorisation is not enforced here. It is enforced by Row Level Security
 * in supabase/schema.sql, because this file ships to the browser and the
 * browser is not trusted. Anything in here that looks like a permission
 * check is a courtesy to the UI, not a control.
 */

import { supabase } from '@/lib/supabase';
import type {
  ActivityEntry,
  Admin,
  AdminSession,
  Backend,
  Butler,
  ButlerNotification,
  ButlerStats,
  Job,
  JobStatus,
  NewButlerInput,
  NewJobInput,
  PushTarget,
  SignInResult,
  StoredPushSubscription,
} from './types';

interface JobRow {
  id: string;
  service: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  scheduled_for: string;
  budget: string;
  details: string;
  submitted_at: string;
  status: JobStatus;
  reject_note: string;
  assigned_butler_id: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  accepted_by_self: boolean;
  rating: number | null;
}

interface ButlerRow {
  id: string;
  name: string;
  contact: string;
  service_area: string;
  job_type_prefs: string[];
  signed_up_at: string;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    service: row.service,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    date: row.scheduled_for,
    budget: row.budget,
    details: row.details,
    submittedAt: row.submitted_at,
    status: row.status,
    rejectNote: row.reject_note,
    assignedButlerId: row.assigned_butler_id,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    acceptedBySelf: row.accepted_by_self,
    ...(row.rating === null ? {} : { rating: row.rating }),
  };
}

function toButler(row: ButlerRow, notifications: ButlerNotification[] = []): Butler {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    serviceArea: row.service_area,
    jobTypePrefs: row.job_type_prefs ?? [],
    signedUpAt: row.signed_up_at,
    notifications,
  };
}

const JOB_COLUMNS =
  'id,service,name,phone,email,address,scheduled_for,budget,details,submitted_at,status,reject_note,assigned_butler_id,assigned_at,completed_at,accepted_by_self,rating';
const BUTLER_COLUMNS = 'id,name,contact,service_area,job_type_prefs,signed_up_at';

/**
 * Turns a PostgREST error into something a teenager reading the screen can
 * act on. The raw messages are written for whoever wrote the SQL.
 */
function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? 'unknown error'}`);
}

async function currentButlerRow(): Promise<ButlerRow | null> {
  const db = supabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db
    .from('butlers')
    .select(BUTLER_COLUMNS)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) fail('Could not load your Butler profile', error);
  return (data as ButlerRow) ?? null;
}

async function isAdminUser(): Promise<boolean> {
  const db = supabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const { data, error } = await db
    .from('admins')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

async function statusOnly(id: string, patch: Record<string, unknown>, context: string) {
  const { error } = await supabase().from('jobs').update(patch).eq('id', id);
  if (error) fail(context, error);
}

/**
 * Asks an edge function to do something this browser must not: send mail,
 * or push to every butler's device. Failures are logged, not thrown — the
 * database change that triggered the call already succeeded, and undoing
 * an approval because an email server was slow would be worse than a
 * missing notification.
 */
async function notify(fn: 'notify-butlers' | 'job-confirmed', jobId: string): Promise<void> {
  const { error } = await supabase().functions.invoke(fn, { body: { jobId } });
  if (error) console.warn(`${fn} failed:`, error.message);
}

export const remote: Backend = {
  kind: 'remote',

  async savePushSubscription(target: PushTarget, subscription: StoredPushSubscription) {
    const db = supabase();

    if ('butlerId' in target) {
      const { error } = await db.from('push_subscriptions').upsert(
        {
          butler_id: target.butlerId,
          job_id: null,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        { onConflict: 'endpoint' },
      );
      if (error) fail('Could not turn on notifications', error);
      return;
    }

    // Neighbours have no account, so this goes through a function that
    // takes the job id they were just handed and nothing else.
    const { error } = await db.rpc('subscribe_to_job', {
      p_job_id: target.jobId,
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth: subscription.auth,
    });
    if (error) fail('Could not turn on notifications', error);
  },

  async getActivity(): Promise<ActivityEntry[]> {
    const { data, error } = await supabase()
      .from('activity')
      .select('id,message,at')
      .order('at', { ascending: false })
      .limit(200);
    if (error) fail('Could not load activity', error);
    return (data ?? []) as ActivityEntry[];
  },

  async getJobs(): Promise<Job[]> {
    const { data, error } = await supabase()
      .from('jobs')
      .select(JOB_COLUMNS)
      .order('submitted_at', { ascending: false });
    if (error) fail('Could not load jobs', error);
    return ((data ?? []) as JobRow[]).map(toJob);
  },

  // Goes through the post_job function rather than a plain insert: a job
  // must always be created as 'New' and unassigned, and the caller — who
  // is usually signed out — must not be able to read job rows back.
  async addJob(data: NewJobInput): Promise<Job> {
    const { data: id, error } = await supabase().rpc('post_job', {
      p_service: data.service,
      p_name: data.name,
      p_phone: data.phone,
      p_email: data.email,
      p_address: data.address,
      p_scheduled_for: data.date,
      p_budget: data.budget,
      p_details: data.details,
    });
    if (error) fail('Could not submit your request', error);

    return {
      id: id as string,
      ...data,
      submittedAt: new Date().toISOString(),
      status: 'New',
      rejectNote: '',
      assignedButlerId: null,
      assignedAt: null,
      completedAt: null,
    };
  },

  // Approving is what makes a job claimable, so it is also the moment to
  // tell butlers it exists.
  async approveJob(id: string) {
    await statusOnly(id, { status: 'Approved' }, 'Could not approve that job');
    await notify('notify-butlers', id);
  },

  async rejectJob(id: string, note: string) {
    await statusOnly(id, { status: 'Rejected', reject_note: note || '' }, 'Could not reject that job');
  },

  async completeJob(id: string, rating?: number) {
    const patch: Record<string, unknown> = {
      status: 'Completed',
      completed_at: new Date().toISOString(),
    };
    if (rating) patch.rating = Math.min(5, Math.max(1, Math.round(rating)));
    await statusOnly(id, patch, 'Could not complete that job');
  },

  async assignJob(id: string, butlerId: string, notifyMessage?: string) {
    await statusOnly(
      id,
      {
        status: 'Assigned',
        assigned_butler_id: butlerId,
        assigned_at: new Date().toISOString(),
        accepted_by_self: false,
      },
      'Could not assign that job',
    );

    if (butlerId && notifyMessage) {
      const { error } = await supabase()
        .from('butler_notifications')
        .insert({ butler_id: butlerId, message: notifyMessage });
      // The assignment itself succeeded; a missing in-app note is not
      // worth failing the action the admin actually took.
      if (error) console.warn('Could not record Butler notification:', error.message);
    }

    // Someone is now actually coming, which is what the neighbour has
    // been waiting to hear.
    await notify('job-confirmed', id);
  },

  // The race is settled in the database — see accept_job() in schema.sql.
  async acceptJob(id: string): Promise<boolean> {
    const { data, error } = await supabase().rpc('accept_job', { p_job_id: id });
    if (error) fail('Could not accept that job', error);
    // A butler claiming a job confirms it just as much as an admin
    // assigning one does. The function is idempotent, so the neighbour
    // hears once either way.
    if (data === true) await notify('job-confirmed', id);
    return data === true;
  },

  // RLS already limits this to approved, unclaimed jobs; the ordering is
  // the part the client is responsible for.
  async getAvailableJobsForButler(butlerId: string): Promise<Job[]> {
    const db = supabase();
    const [{ data: jobRows, error }, { data: me }] = await Promise.all([
      db
        .from('jobs')
        .select(JOB_COLUMNS)
        .eq('status', 'Approved')
        .is('assigned_butler_id', null)
        .order('submitted_at', { ascending: false }),
      db.from('butlers').select(BUTLER_COLUMNS).eq('id', butlerId).maybeSingle(),
    ]);
    if (error) fail('Could not load available jobs', error);

    const butler = me as ButlerRow | null;
    const prefs = butler?.job_type_prefs ?? [];
    const area = (butler?.service_area ?? '').trim().toLowerCase();
    const score = (j: Job) =>
      (prefs.includes(j.service) ? 2 : 0) + (area && j.address.toLowerCase().includes(area) ? 1 : 0);

    return ((jobRows ?? []) as JobRow[])
      .map(toJob)
      .sort((a, b) => score(b) - score(a) || +new Date(b.submittedAt) - +new Date(a.submittedAt));
  },

  async getMyJobsForButler(butlerId: string): Promise<Job[]> {
    const { data, error } = await supabase()
      .from('jobs')
      .select(JOB_COLUMNS)
      .eq('assigned_butler_id', butlerId)
      .order('assigned_at', { ascending: false });
    if (error) fail('Could not load your jobs', error);
    return ((data ?? []) as JobRow[]).map(toJob);
  },

  // Admin-only by policy. Notifications are left empty: the roster does
  // not show them, and fetching them per butler would be a query each.
  async getButlers(): Promise<Butler[]> {
    const { data, error } = await supabase()
      .from('butlers')
      .select(BUTLER_COLUMNS)
      .order('signed_up_at', { ascending: false });
    if (error) fail('Could not load the Butler roster', error);
    return ((data ?? []) as ButlerRow[]).map((row) => toButler(row));
  },

  async addButler(data: NewButlerInput, password: string): Promise<Butler> {
    const db = supabase();
    const email = data.contact.trim();

    const { data: signUp, error: signUpError } = await db.auth.signUp({ email, password });
    if (signUpError) fail('Could not create your account', signUpError);

    // With email confirmation switched on there is no session yet, so the
    // profile row cannot be written — and the RLS policy requires the row
    // to belong to the signed-in user, which is the correct behaviour.
    if (!signUp.session || !signUp.user) {
      throw new Error(
        'Check your email and click the confirmation link, then sign in. ' +
          '(To skip this step, turn off email confirmation in Supabase → Authentication → Providers → Email.)',
      );
    }

    const { data: row, error } = await db
      .from('butlers')
      .insert({
        user_id: signUp.user.id,
        name: data.name,
        contact: email,
        service_area: data.serviceArea,
        job_type_prefs: data.jobTypePrefs,
      })
      .select(BUTLER_COLUMNS)
      .single();
    if (error) fail('Your account was created but your profile was not saved', error);

    return toButler(row as ButlerRow);
  },

  async getButlerStats(butlerId: string): Promise<ButlerStats> {
    const { data, error } = await supabase()
      .from('jobs')
      .select('status,rating')
      .eq('assigned_butler_id', butlerId);
    if (error) fail('Could not load Butler stats', error);

    const rows = (data ?? []) as { status: JobStatus; rating: number | null }[];
    const completed = rows.filter((r) => r.status === 'Completed');
    const rated = completed.filter((r) => typeof r.rating === 'number');
    return {
      jobsAssigned: rows.length,
      jobsCompleted: completed.length,
      avgRating: rated.length
        ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length
        : null,
      ratedJobs: rated.length,
    };
  },

  async getAdmins(): Promise<Admin[]> {
    const { data, error } = await supabase()
      .from('admins')
      .select('id,email,added_at')
      .order('added_at', { ascending: true });
    if (error) fail('Could not load admins', error);
    return ((data ?? []) as { id: string; email: string; added_at: string }[]).map((row) => ({
      id: row.id,
      email: row.email,
      addedAt: row.added_at,
    }));
  },

  // Creating a user account needs the service role key, which must never
  // reach a browser. The invite-admin function holds it and checks that
  // the caller is already an admin before doing anything.
  async addAdmin(email: string, password: string) {
    const db = supabase();
    const { data: session } = await db.auth.getSession();
    if (!session.session) throw new Error('Sign in again before adding an admin.');

    const { error } = await db.functions.invoke('invite-admin', {
      body: { email: email.trim(), password },
    });
    if (error) fail('Could not add that admin', error);
  },

  async changeAdminPassword(email: string, currentPassword: string, newPassword: string) {
    const db = supabase();
    // Supabase lets a signed-in user change their password without
    // re-stating the old one. Re-authenticating first means someone who
    // walks up to an unlocked laptop cannot take the account over.
    const { error: reauth } = await db.auth.signInWithPassword({
      email: email.trim(),
      password: currentPassword,
    });
    if (reauth) return false;

    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) fail('Could not update your password', error);
    return true;
  },

  async adminLogin(email: string, password: string) {
    const db = supabase();
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return false;
    if (await isAdminUser()) return true;
    // Correct password, but not an admin account. Don't leave them
    // holding a session the admin page will keep rejecting.
    await db.auth.signOut();
    return false;
  },

  async getAdminSession(): Promise<AdminSession | null> {
    const db = supabase();
    const { data } = await db.auth.getUser();
    if (!data.user) return null;
    if (!(await isAdminUser())) return null;
    return { email: data.user.email ?? '' };
  },

  async adminLogout() {
    await supabase().auth.signOut();
  },

  async signIn(contact: string, password: string): Promise<SignInResult> {
    const db = supabase();
    const { error } = await db.auth.signInWithPassword({
      email: contact.trim(),
      password,
    });
    if (error) return { kind: 'unknown' };

    if (await isAdminUser()) return { kind: 'admin' };

    const row = await currentButlerRow();
    if (row) return { kind: 'butler', butler: toButler(row) };

    // Authenticated but with neither profile — a half-finished signup.
    await db.auth.signOut();
    return { kind: 'unknown' };
  },

  async getCurrentButler(): Promise<Butler | null> {
    const row = await currentButlerRow();
    if (!row) return null;

    const { data } = await supabase()
      .from('butler_notifications')
      .select('message,at,read')
      .eq('butler_id', row.id)
      .order('at', { ascending: false })
      .limit(50);

    return toButler(row, (data ?? []) as ButlerNotification[]);
  },

  async butlerLogout() {
    await supabase().auth.signOut();
  },
};
