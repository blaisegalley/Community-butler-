import { FormEvent, useState } from 'react';
import { LogoMark } from '@/components/Logo';
import {
  adminLogin,
  adminLogout,
  approveJob,
  assignJob,
  Butler,
  completeJob,
  getAdminSession,
  getButlers,
  getJobs,
  Job,
  JobStatus,
  rejectJob,
} from '@/lib/store';
import { inputClass, labelClass, primaryBtn } from '@/components/FormControls';

export default function AdminPage() {
  const [session, setSession] = useState(() => getAdminSession());

  if (!session) {
    return <AdminLogin onSignedIn={() => setSession(getAdminSession())} />;
  }
  return <AdminDashboard email={session.email} onLogout={() => { adminLogout(); setSession(null); }} />;
}

function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (adminLogin(email, password)) {
      onSignedIn();
    } else {
      setError("That email/password combo isn't on the admin allowlist.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F1EDE6] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px] bg-white border border-black/10 rounded-[18px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)] p-7 sm:p-8 text-center">
        <div className="flex justify-center text-[#17161B] mb-3">
          <LogoMark />
        </div>
        <h1 className="text-[#17161B] text-[20px] font-semibold">Admin sign in</h1>
        <p className="text-[#55545C] text-[13.5px] mt-1 mb-6">Restricted to the Community Butler team.</p>

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
          <button type="submit" className={primaryBtn}>Sign in</button>
        </form>
      </div>
    </div>
  );
}

const STATUS_ORDER: Record<JobStatus, number> = { New: 0, Approved: 1, Assigned: 2, Completed: 3, Rejected: 4 };

const STATUS_STYLES: Record<JobStatus, string> = {
  New: 'bg-[#71757C]/15 text-[#44474C]',
  Approved: 'bg-[#0B0B0C]/8 text-[#17161B]',
  Assigned: 'bg-[#0B0B0C]/10 text-[#0B0B0C]',
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

function AdminDashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [, forceRender] = useState(0);
  const refresh = () => forceRender((n) => n + 1);

  const jobs = getJobs()
    .slice()
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || +new Date(b.submittedAt) - +new Date(a.submittedAt));
  const butlers = getButlers();

  const jobsThisWeek = jobs.filter((j) => sameWeek(j.submittedAt)).length;
  const pending = jobs.filter((j) => j.status === 'New').length;
  const completedThisMonth = jobs.filter((j) => j.status === 'Completed' && sameMonth(j.completedAt)).length;

  return (
    <div className="min-h-screen bg-[#F1EDE6]">
      <div className="max-w-[1080px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap pb-5 mb-6 border-b border-black/10">
          <a href="/" className="flex items-center gap-2.5 text-[#17161B] font-semibold text-[15px]">
            <LogoMark />
            Community Butler <span className="text-black/40 font-normal">Admin</span>
          </a>
          <div className="flex items-center gap-3 text-[13px] text-black/50">
            <span>Signed in as <strong className="text-[#17161B]">{email}</strong></span>
            <button onClick={onLogout} className="h-[34px] px-3.5 rounded-[8px] border border-black/15 text-[#17161B] text-[12.5px] font-medium hover:bg-black/5 transition-colors">
              Log out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-8">
          <StatTile value={jobsThisWeek} label="Jobs this week" />
          <StatTile value={pending} label="Pending approvals" />
          <StatTile value={butlers.length} label="Active Butlers" />
          <StatTile value={completedThisMonth} label="Completed this month" />
        </div>

        <section className="mb-9">
          <div className="flex items-baseline justify-between mb-3.5">
            <h2 className="text-[17px] font-bold text-[#17161B]">Job requests</h2>
            <span className="text-[12.5px] text-black/45">{jobs.length} {jobs.length === 1 ? 'request' : 'requests'}</span>
          </div>
          {jobs.length ? (
            <div className="flex flex-col gap-2.5">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} butlers={butlers} onChange={refresh} />
              ))}
            </div>
          ) : (
            <EmptyState text="No job requests yet — submissions from /request will appear here." />
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3.5">
            <h2 className="text-[17px] font-bold text-[#17161B]">Butler roster</h2>
            <span className="text-[12.5px] text-black/45">{butlers.length} {butlers.length === 1 ? 'Butler' : 'Butlers'}</span>
          </div>
          {butlers.length ? (
            <div className="flex flex-col gap-2.5">
              {butlers.map((b) => (
                <ButlerCard key={b.id} butler={b} />
              ))}
            </div>
          ) : (
            <EmptyState text="No Butlers signed up yet — sign-ups from /auth will appear here." />
          )}
        </section>
      </div>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4">
      <div className="text-[26px] font-bold text-[#17161B] tabular-nums">{value}</div>
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

function JobCard({ job, butlers, onChange }: { job: Job; butlers: Butler[]; onChange: () => void }) {
  const [selectedButler, setSelectedButler] = useState(butlers[0]?.id ?? '');
  const assignedButler = butlers.find((b) => b.id === job.assignedButlerId);

  function handleApprove() {
    approveJob(job.id);
    onChange();
  }
  function handleReject() {
    const note = window.prompt('Reason for rejecting this request (optional):', '');
    if (note !== null) {
      rejectJob(job.id, note);
      onChange();
    }
  }
  function handleAssign() {
    if (!selectedButler) {
      window.alert('Pick a Butler to assign first.');
      return;
    }
    assignJob(job.id, selectedButler, `You've been assigned a new job: ${job.service}. Check the admin for details.`);
    onChange();
  }
  function handleComplete() {
    completeJob(job.id);
    onChange();
  }

  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[14.5px] font-bold text-[#17161B]">{job.service || 'Job request'} — {job.name}</div>
          <div className="text-[12.5px] text-black/45 mt-0.5">{job.address} · submitted {fmtRelative(job.submittedAt)}</div>
        </div>
        <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-[10px] py-[3px] whitespace-nowrap ${STATUS_STYLES[job.status]}`}>
          {job.status}
        </span>
      </div>

      {job.details && <div className="text-[13px] text-[#55545C] mt-2">{job.details}</div>}

      <dl className="grid gap-x-4 gap-y-1 mt-2.5 text-[12.5px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <div><dt className="text-black/40">Phone</dt><dd className="text-[#17161B] font-medium">{job.phone || '—'}</dd></div>
        <div><dt className="text-black/40">Email</dt><dd className="text-[#17161B] font-medium">{job.email || '—'}</dd></div>
        <div><dt className="text-black/40">Preferred date</dt><dd className="text-[#17161B] font-medium">{job.date || 'Flexible'}</dd></div>
        <div><dt className="text-black/40">Budget</dt><dd className="text-[#17161B] font-medium">{job.budget ? `$${job.budget}` : 'Not specified'}</dd></div>
      </dl>

      {(job.status === 'Assigned' || job.status === 'Completed') && (
        <div className="text-[12.5px] text-[#55545C] mt-2">
          Assigned to <strong className="text-[#17161B]">{assignedButler?.name ?? 'Unknown Butler'}</strong>
          {job.completedAt ? ` — completed ${fmtDate(job.completedAt)}` : ''}
        </div>
      )}
      {job.status === 'Rejected' && job.rejectNote && (
        <div className="text-[12.5px] text-[#8c2f1c] mt-2">Rejected: {job.rejectNote}</div>
      )}

      {job.status === 'New' && (
        <div className="flex gap-2 mt-3">
          <button onClick={handleApprove} className="h-[32px] px-3.5 rounded-[8px] bg-[#0B0B0C] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity">Approve</button>
          <button onClick={handleReject} className="h-[32px] px-3.5 rounded-[8px] border border-black/15 text-[#17161B] text-[12.5px] font-medium hover:bg-black/5 transition-colors">Reject</button>
        </div>
      )}
      {job.status === 'Approved' && (
        <div className="flex gap-2 mt-3 items-center">
          <select
            value={selectedButler}
            onChange={(e) => setSelectedButler(e.target.value)}
            className="h-[32px] rounded-[8px] border border-black/15 text-[12.5px] px-2 bg-white text-[#17161B]"
          >
            {butlers.length ? butlers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">No Butlers signed up yet</option>}
          </select>
          <button onClick={handleAssign} disabled={!butlers.length} className="h-[32px] px-3.5 rounded-[8px] bg-[#0B0B0C] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            Assign
          </button>
        </div>
      )}
      {job.status === 'Assigned' && (
        <div className="mt-3">
          <button onClick={handleComplete} className="h-[32px] px-3.5 rounded-[8px] bg-[#0B0B0C] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity">
            Mark completed
          </button>
        </div>
      )}
    </div>
  );
}

function ButlerCard({ butler }: { butler: Butler }) {
  const unread = (butler.notifications || []).length;
  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[14.5px] font-bold text-[#17161B]">{butler.name}</div>
        <div className="text-[12.5px] text-black/45 mt-0.5">
          {butler.contact} · {butler.serviceArea || 'No area set'} · signed up {fmtDate(butler.signedUpAt)}
        </div>
        {!!butler.jobTypePrefs.length && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {butler.jobTypePrefs.map((p) => (
              <span key={p} className="text-[11.5px] bg-[#F1EDE6] border border-black/10 rounded-full px-[9px] py-[3px] text-[#44474C]">{p}</span>
            ))}
          </div>
        )}
      </div>
      {unread > 0 && (
        <span className="text-[11px] font-bold bg-[#0B0B0C] text-white rounded-full px-[9px] py-[3px] whitespace-nowrap">{unread} new</span>
      )}
    </div>
  );
}
