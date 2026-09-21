import { FormEvent, useState } from 'react';
import { LogoMark } from '@/components/Logo';
import {
  addAdmin,
  Admin,
  adminLogin,
  adminLogout,
  approveJob,
  assignJob,
  Butler,
  ButlerStats,
  changeAdminPassword,
  completeJob,
  getActivity,
  getAdminSession,
  getAdmins,
  getButlers,
  getButlerStats,
  getJobs,
  isShared,
  Job,
  JobStatus,
  rejectJob,
} from '@/lib/store';
import { useQuery } from '@/lib/useQuery';
import { inputClass, labelClass, primaryBtn } from '@/components/FormControls';
import { withBase } from '@/lib/url';

export default function AdminPage() {
  const { data: session, loading, reload } = useQuery(getAdminSession);

  // Reading the session is a round trip now, and flashing the sign-in form
  // at an admin who is already signed in reads as being logged out.
  if (loading) return <Centered>Checking your session\u2026</Centered>;
  if (!session) return <AdminLogin onSignedIn={reload} />;

  return (
    <AdminDashboard
      email={session.email}
      onLogout={async () => {
        await adminLogout();
        reload();
      }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sand flex items-center justify-center px-5 text-graphite text-[14px]">
      {children}
    </div>
  );
}

function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (await adminLogin(email, password)) {
        onSignedIn();
      } else {
        setError("That email and password don't match an admin account.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px] bg-white border border-black/10 rounded-[18px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)] p-7 sm:p-8 text-center">
        <div className="flex justify-center text-ink mb-3">
          <LogoMark />
        </div>
        <h1 className="text-ink text-[20px] font-semibold">Admin sign in</h1>
        <p className="text-graphite text-[13.5px] mt-1 mb-6">Restricted to the Community Butler team.</p>

        {error && (
          <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-4 text-left">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="text-left">
          <div className="mb-4">
            <label className={labelClass} htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mb-5">
            <label className={labelClass} htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? 'Signing in\u2026' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const STATUS_ORDER: Record<JobStatus, number> = { New: 0, Approved: 1, Assigned: 2, Completed: 3, Rejected: 4 };

const STATUS_STYLES: Record<JobStatus, string> = {
  New: 'bg-graphite/15 text-[#44474C]',
  Approved: 'bg-ink/8 text-ink',
  Assigned: 'bg-ink/10 text-ink',
  Completed: 'bg-[#2c7a41]/15 text-[#2c7a41]',
  Rejected: 'bg-[#C4442E]/12 text-[#8c2f1c]',
};

function sameWeek(iso: string) {
  return Date.now() - +new Date(iso) <= 7 * 24 * 60 * 60 * 1000;
}
function sameMonth(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
function fmtRelative(iso: string) {
  const mins = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type Tab = 'jobs' | 'butlers' | 'activity' | 'admins';

/**
 * The roster with each Butler's stats attached. One query per Butler is a
 * lot in principle; in practice this is a neighbourhood with a handful of
 * them, and it keeps the counting logic in one place instead of a view.
 */
async function loadRoster(): Promise<{ butler: Butler; stats: ButlerStats }[]> {
  const butlers = await getButlers();
  const withStats = await Promise.all(
    butlers.map(async (butler) => ({ butler, stats: await getButlerStats(butler.id) })),
  );
  return withStats.sort(
    (a, b) =>
      b.stats.jobsCompleted - a.stats.jobsCompleted || b.stats.jobsAssigned - a.stats.jobsAssigned,
  );
}

function AdminDashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('jobs');

  const jobsQuery = useQuery(getJobs);
  const butlersQuery = useQuery(getButlers);
  const activityQuery = useQuery(getActivity);
  const adminsQuery = useQuery(getAdmins);
  const rosterQuery = useQuery(loadRoster);

  const loadError =
    jobsQuery.error ?? butlersQuery.error ?? activityQuery.error ?? adminsQuery.error;

  const jobs = (jobsQuery.data ?? [])
    .slice()
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || +new Date(b.submittedAt) - +new Date(a.submittedAt));
  const butlers = butlersQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const admins = adminsQuery.data ?? [];
  const butlersByActivity = rosterQuery.data ?? [];

  const jobsThisWeek = jobs.filter((j) => sameWeek(j.submittedAt)).length;
  const pending = jobs.filter((j) => j.status === 'New').length;
  const completedThisMonth = jobs.filter((j) => j.status === 'Completed' && sameMonth(j.completedAt)).length;

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'jobs', label: 'Job requests', count: jobs.length },
    { id: 'butlers', label: 'Butler roster', count: butlers.length },
    { id: 'activity', label: 'Activity', count: activity.length },
    { id: 'admins', label: 'Admins', count: admins.length },
  ];

  return (
    <div className="min-h-screen bg-sand">
      <div className="max-w-[1080px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap pb-5 mb-6 border-b border-black/10">
          <a href={withBase('')} className="flex items-center gap-2.5 text-ink font-semibold text-[15px]">
            <LogoMark />
            Community Butler <span className="text-black/40 font-normal">Admin</span>
          </a>
          <div className="flex items-center gap-3 text-[13px] text-black/50">
            <span>Signed in as <strong className="text-ink">{email}</strong></span>
            <button onClick={onLogout} className="h-[34px] px-3.5 rounded-[8px] border border-black/15 text-ink text-[12.5px] font-medium hover:bg-black/5 transition-colors">
              Log out
            </button>
          </div>
        </div>

        {!isShared && (
          <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-5">
            <strong>Demo mode.</strong> No database is connected, so this dashboard only shows
            requests submitted from <em>this</em> browser — not ones neighbours post from their own
            phones — and nobody can be notified or emailed. See SETUP.md.
          </div>
        )}

        {loadError && (
          <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-5">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-8">
          <StatTile value={jobsThisWeek} label="Jobs this week" />
          <StatTile value={pending} label="Pending approvals" />
          <StatTile value={butlers.length} label="Active Butlers" />
          <StatTile value={completedThisMonth} label="Completed this month" />
        </div>

        <div className="flex gap-1.5 mb-6 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`h-[36px] px-4 rounded-[9px] text-[13px] font-medium transition-colors ${
                tab === t.id ? 'bg-ink text-white' : 'bg-white border border-black/10 text-ink hover:bg-black/5'
              }`}
            >
              {t.label} <span className={tab === t.id ? 'text-white/60' : 'text-black/40'}>({t.count})</span>
            </button>
          ))}
        </div>

        {tab === 'jobs' && (
          <section>
            {jobs.length ? (
              <div className="flex flex-col gap-2.5">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} butlers={butlers} />
                ))}
              </div>
            ) : (
              <EmptyState
                text={
                  jobsQuery.loading
                    ? 'Loading job requests\u2026'
                    : 'No job requests yet — submissions from /request will appear here.'
                }
              />
            )}
          </section>
        )}

        {tab === 'butlers' && (
          <section>
            <p className="text-[12.5px] text-black/45 mb-3.5">Sorted by most jobs completed, so you can see who's carrying the load.</p>
            {butlersByActivity.length ? (
              <div className="flex flex-col gap-2.5">
                {butlersByActivity.map(({ butler, stats }) => (
                  <ButlerCard key={butler.id} butler={butler} stats={stats} />
                ))}
              </div>
            ) : (
              <EmptyState text="No Butlers signed up yet — sign-ups from /auth will appear here." />
            )}
          </section>
        )}

        {tab === 'activity' && (
          <section>
            {activity.length ? (
              <div className="flex flex-col gap-1.5">
                {activity.map((entry) => (
                  <div key={entry.id} className="bg-white border border-black/10 rounded-[10px] px-3.5 py-2.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-ink">{entry.message}</span>
                    <span className="text-black/40 text-[12px] whitespace-nowrap">{fmtRelative(entry.at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No activity yet — actions across the site will show up here." />
            )}
          </section>
        )}

        {tab === 'admins' && <AdminsSection admins={admins} email={email} />}
      </div>
    </div>
  );
}

function AdminsSection({ admins, email: myEmail }: { admins: Admin[]; email: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return;
    if (admins.some((a) => a.email.toLowerCase() === normalized)) {
      setError('That email is already an admin.');
      return;
    }
    setBusy(true);
    try {
      await addAdmin(email.trim(), password);
      setEmail('');
      setPassword('');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that admin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <ChangePasswordCard email={myEmail} />

      <div className="bg-white border border-black/10 rounded-[14px] p-5">
        <h3 className="text-[14.5px] font-bold text-ink mb-3.5">Add an admin</h3>
        {error && (
          <div className="rounded-[8px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[12.5px] px-3.5 py-2.5 mb-3.5">
            {error}
          </div>
        )}
        <form onSubmit={handleAdd} noValidate className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <label className={labelClass} htmlFor="new-admin-email">Email</label>
            <input id="new-admin-email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex-1 w-full">
            <label className={labelClass} htmlFor="new-admin-password">Password</label>
            <input id="new-admin-password" type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} className="h-[42px] px-5 rounded-[10px] bg-ink text-white text-[13.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 whitespace-nowrap">
            {busy ? 'Adding\u2026' : 'Add admin'}
          </button>
        </form>
      </div>

      <div>
        <h3 className="text-[14.5px] font-bold text-ink mb-3.5">Current admins</h3>
        <div className="flex flex-col gap-2.5">
          {admins.map((a) => (
            <div key={a.id} className="bg-white border border-black/10 rounded-[12px] px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[13.5px] font-medium text-ink">{a.email}</span>
              <span className="text-[12px] text-black/40 whitespace-nowrap">added {fmtDate(a.addedAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      if (await changeAdminPassword(email, current, next)) {
        setStatus({ kind: 'success', text: 'Password updated.' });
        setCurrent('');
        setNext('');
      } else {
        setStatus({ kind: 'error', text: 'Current password is incorrect.' });
      }
    } catch (cause) {
      setStatus({
        kind: 'error',
        text: cause instanceof Error ? cause.message : 'Could not update your password.',
      });
    }
  }

  return (
    <div className="bg-white border border-black/10 rounded-[14px] p-5">
      <h3 className="text-[14.5px] font-bold text-ink mb-3.5">Change your password</h3>
      {status && (
        <div
          className={`rounded-[8px] border text-[12.5px] px-3.5 py-2.5 mb-3.5 ${
            status.kind === 'success'
              ? 'border-[#2c7a41]/30 bg-[#2c7a41]/10 text-[#215c31]'
              : 'border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c]'
          }`}
        >
          {status.text}
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full">
          <label className={labelClass} htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" required className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="flex-1 w-full">
          <label className={labelClass} htmlFor="new-password">New password</label>
          <input id="new-password" type="password" required minLength={6} className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <button type="submit" className="h-[42px] px-5 rounded-[10px] bg-ink text-white text-[13.5px] font-medium hover:opacity-90 transition-opacity whitespace-nowrap">
          Update password
        </button>
      </form>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4">
      <div className="text-[26px] font-bold text-ink tabular-nums">{value}</div>
      <div className="text-[12px] text-black/45 mt-1">{label}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-black/15 rounded-[12px] bg-white text-center text-black/45 text-[13.5px] py-7 px-5">
      {text}
    </div>
  );
}

function JobCard({ job, butlers }: { job: Job; butlers: Butler[] }) {
  const [selectedButler, setSelectedButler] = useState(butlers[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const assignedButler = butlers.find((b) => b.id === job.assignedButlerId);

  // Every action is a write the admin needs to know actually landed —
  // approving a job is what releases it to butlers and fires their alerts.
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const handleApprove = () => run(() => approveJob(job.id));

  function handleReject() {
    const note = window.prompt('Reason for rejecting this request (optional):', '');
    if (note !== null) void run(() => rejectJob(job.id, note));
  }

  function handleAssign() {
    if (!selectedButler) {
      window.alert('Pick a Butler to assign first.');
      return;
    }
    void run(() =>
      assignJob(
        job.id,
        selectedButler,
        `You've been assigned a new job: ${job.service}. Check the admin for details.`,
      ),
    );
  }

  const handleComplete = (rating: number) => run(() => completeJob(job.id, rating));

  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[14.5px] font-bold text-ink">{job.service || 'Job request'} — {job.name}</div>
          <div className="text-[12.5px] text-black/45 mt-0.5">{job.address} · submitted {fmtRelative(job.submittedAt)}</div>
        </div>
        <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-[10px] py-[3px] whitespace-nowrap ${STATUS_STYLES[job.status]}`}>
          {job.status}
        </span>
      </div>

      {job.details && <div className="text-[13px] text-graphite mt-2">{job.details}</div>}

      <dl className="grid gap-x-4 gap-y-1 mt-2.5 text-[12.5px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <div><dt className="text-black/40">Phone</dt><dd className="text-ink font-medium">{job.phone || '—'}</dd></div>
        <div><dt className="text-black/40">Email</dt><dd className="text-ink font-medium">{job.email || '—'}</dd></div>
        <div><dt className="text-black/40">Preferred date</dt><dd className="text-ink font-medium">{job.date || 'Flexible'}</dd></div>
        <div><dt className="text-black/40">Budget</dt><dd className="text-ink font-medium">{job.budget ? `$${job.budget}` : 'Not specified'}</dd></div>
      </dl>

      {(job.status === 'Assigned' || job.status === 'Completed') && (
        <div className="text-[12.5px] text-graphite mt-2">
          Assigned to <strong className="text-ink">{assignedButler?.name ?? 'Unknown Butler'}</strong>
          {job.completedAt ? ` — completed ${fmtDate(job.completedAt)}` : ''}
          {job.status === 'Completed' && job.rating && (
            <span className="ml-1.5 text-ink font-medium">· {job.rating}★</span>
          )}
        </div>
      )}
      {job.status === 'Rejected' && job.rejectNote && (
        <div className="text-[12.5px] text-[#8c2f1c] mt-2">Rejected: {job.rejectNote}</div>
      )}

      {job.status === 'New' && (
        <div className="flex gap-2 mt-3">
          <button onClick={handleApprove} disabled={busy} className="h-[32px] px-3.5 rounded-[8px] bg-ink text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">Approve</button>
          <button onClick={handleReject} disabled={busy} className="h-[32px] px-3.5 rounded-[8px] border border-black/15 text-ink text-[12.5px] font-medium hover:bg-black/5 transition-colors disabled:opacity-40">Reject</button>
        </div>
      )}
      {job.status === 'Approved' && (
        <div className="flex gap-2 mt-3 items-center">
          <select
            value={selectedButler}
            onChange={(e) => setSelectedButler(e.target.value)}
            className="h-[32px] rounded-[8px] border border-black/15 text-[12.5px] px-2 bg-white text-ink"
          >
            {butlers.length ? butlers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">No Butlers signed up yet</option>}
          </select>
          <button onClick={handleAssign} disabled={busy || !butlers.length} className="h-[32px] px-3.5 rounded-[8px] bg-ink text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            Assign
          </button>
        </div>
      )}
      {job.status === 'Assigned' && (
        <div className="mt-3">
          <div className="text-[11.5px] text-black/45 mb-1.5">Mark completed and rate the Butler's work</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => handleComplete(n)}
                disabled={busy}
                title={`Complete and rate ${n} star${n > 1 ? 's' : ''}`}
                className="h-[32px] px-2.5 rounded-[8px] border border-black/15 text-[12.5px] font-medium text-ink hover:bg-black/5 transition-colors disabled:opacity-40"
              >
                {n}★
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StarRow({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-black/35">No ratings yet</span>;
  return (
    <span className="text-ink font-medium">
      {rating.toFixed(1)}★
    </span>
  );
}

function ButlerCard({ butler, stats }: { butler: Butler; stats: ButlerStats }) {
  const unread = (butler.notifications || []).length;
  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[14.5px] font-bold text-ink">{butler.name}</div>
        <div className="text-[12.5px] text-black/45 mt-0.5">
          {butler.contact} · {butler.serviceArea || 'No area set'} · signed up {fmtDate(butler.signedUpAt)}
        </div>
        {!!butler.jobTypePrefs.length && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {butler.jobTypePrefs.map((p) => (
              <span key={p} className="text-[11.5px] bg-sand border border-black/10 rounded-full px-[9px] py-[3px] text-[#44474C]">{p}</span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12.5px]">
          <span className="text-black/45">{stats.jobsCompleted} completed</span>
          <span className="text-black/45">{stats.jobsAssigned} assigned</span>
          <StarRow rating={stats.avgRating} />
        </div>
      </div>
      {unread > 0 && (
        <span className="text-[11px] font-bold bg-ink text-white rounded-full px-[9px] py-[3px] whitespace-nowrap">{unread} new</span>
      )}
    </div>
  );
}
