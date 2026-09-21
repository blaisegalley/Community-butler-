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
  /** 1-5 admin-given rating of the Butler's performance on this job. */
  rating?: number;
}

export type NewJobInput = Pick<
  Job,
  'service' | 'name' | 'phone' | 'email' | 'address' | 'date' | 'budget' | 'details'
>;

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

export interface ButlerStats {
  jobsAssigned: number;
  jobsCompleted: number;
  avgRating: number | null;
  ratedJobs: number;
}

/**
 * An admin as the dashboard sees them. Deliberately has no password field:
 * the local backend keeps one internally, but it must never reach a
 * component or a prop, and the hosted backend never has one at all —
 * Supabase Auth owns those.
 */
export interface Admin {
  id: string;
  email: string;
  addedAt: string;
}

export interface ActivityEntry {
  id: string;
  message: string;
  at: string;
}

export interface AdminSession {
  email: string;
}

export type SignInResult =
  | { kind: 'admin' }
  | { kind: 'butler'; butler: Butler }
  | { kind: 'unknown' };

/**
 * Everything the app can ask of its data layer. Two implementations satisfy
 * it: `local` (this browser's localStorage) and `remote` (Supabase).
 *
 * Every method is async even where the local one answers instantly, so a
 * project that starts on localStorage and later gets a real database does
 * not need its components rewritten a second time.
 */
export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushTarget = { butlerId: string } | { jobId: string };

export interface Backend {
  readonly kind: 'local' | 'remote';

  savePushSubscription(target: PushTarget, subscription: StoredPushSubscription): Promise<void>;

  getActivity(): Promise<ActivityEntry[]>;

  getJobs(): Promise<Job[]>;
  addJob(data: NewJobInput): Promise<Job>;
  approveJob(id: string): Promise<void>;
  rejectJob(id: string, note: string): Promise<void>;
  completeJob(id: string, rating?: number): Promise<void>;
  assignJob(id: string, butlerId: string, notifyMessage?: string): Promise<void>;
  /** Returns false when someone else took the job first. */
  acceptJob(id: string, butlerId: string): Promise<boolean>;
  getAvailableJobsForButler(butlerId: string): Promise<Job[]>;
  getMyJobsForButler(butlerId: string): Promise<Job[]>;

  getButlers(): Promise<Butler[]>;
  addButler(data: NewButlerInput, password: string): Promise<Butler>;
  getButlerStats(butlerId: string): Promise<ButlerStats>;

  getAdmins(): Promise<Admin[]>;
  addAdmin(email: string, password: string): Promise<void>;
  changeAdminPassword(email: string, currentPassword: string, newPassword: string): Promise<boolean>;

  adminLogin(email: string, password: string): Promise<boolean>;
  getAdminSession(): Promise<AdminSession | null>;
  adminLogout(): Promise<void>;

  /**
   * One sign-in door for both roles. The hosted backend has a single
   * identity system, so trying an admin login and then a butler login —
   * as two separate calls — would mean signing in twice and leaving a
   * half-authenticated session behind when the first attempt succeeds.
   */
  signIn(contact: string, password: string): Promise<SignInResult>;
  getCurrentButler(): Promise<Butler | null>;
  butlerLogout(): Promise<void>;
}
