import { FormEvent, ReactNode, useState } from 'react';
import Animate from '@/components/Animate';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import {
  acceptJob,
  addButler,
  Butler,
  butlerLoginByContact,
  butlerLoginById,
  butlerLogout,
  getAvailableJobsForButler,
  getCurrentButler,
  getMyJobsForButler,
  Job,
} from '@/lib/store';
import { fieldWrap, inputClass, labelClass, primaryBtn } from '@/components/FormControls';

const JOB_TYPE_OPTIONS = ['Yard work', 'Snow shoveling', 'Moving help', 'Junk hauling', 'Cleanouts', 'Dog walking', 'Odd jobs'];

type Mode = 'signup' | 'signin';

function initialMode(): Mode {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'signin' ? 'signin' : 'signup';
}

export default function AuthPage() {
  const [butler, setButler] = useState<Butler | null>(() => getCurrentButler());

  if (butler) {
    return <ButlerDashboard butler={butler} onLogout={() => { butlerLogout(); setButler(null); }} />;
  }
  return <GuestAuth onAuthed={(b) => setButler(b)} />;
}

function GuestAuth({ onAuthed }: { onAuthed: (b: Butler) => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState('');
  const [signup, setSignup] = useState({ name: '', contact: '', area: '', password: '' });
  const [prefs, setPrefs] = useState<string[]>([]);
  const [signin, setSignin] = useState({ contact: '', password: '' });

  function togglePref(p: string) {
    setPrefs((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!e.currentTarget.reportValidity()) return;

    if (mode === 'signup') {
      const created = addButler({ name: signup.name, contact: signup.contact, serviceArea: signup.area, jobTypePrefs: prefs });
      butlerLoginById(created.id);
      onAuthed(created);
    } else {
      const found = butlerLoginByContact(signin.contact);
      if (found) {
        onAuthed(found);
      } else {
        setError(
          "We couldn't find a Butler account with that phone/email on this device. Since there's no backend yet, accounts only exist on the device/browser they signed up on — sign up if this is your first time here.",
        );
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF5EC] flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full max-w-[560px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <Animate delay={0} direction="up">
          <div className="inline-flex border border-black/10 rounded-[11px] p-[4px] bg-white mb-6">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`h-[38px] px-5 rounded-[8px] text-[13.5px] font-semibold transition-colors ${mode === 'signup' ? 'bg-[#0B0B0C] text-white' : 'text-black/50'}`}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`h-[38px] px-5 rounded-[8px] text-[13.5px] font-semibold transition-colors ${mode === 'signin' ? 'bg-[#0B0B0C] text-white' : 'text-black/50'}`}
            >
              Sign in
            </button>
          </div>
          <h1 className="text-[#17161B] text-[28px] font-semibold mb-2">
            {mode === 'signup' ? 'Get started' : 'Butler sign in'}
          </h1>
          <p className="text-[#55545C] text-[15px] mb-8">
            {mode === 'signup'
              ? 'Create your Butler account to start seeing jobs near you.'
              : 'Welcome back — sign in to see your jobs and schedule.'}
          </p>
        </Animate>

        {error && (
          <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-5">
            {error}
          </div>
        )}

        <Animate delay={150} direction="up">
          <form onSubmit={handleSubmit} noValidate>
            {mode === 'signup' ? (
              <>
                <div className={fieldWrap}>
                  <label className={labelClass} htmlFor="su-name">Name</label>
                  <input id="su-name" required className={inputClass} value={signup.name} onChange={(e) => setSignup((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div className={fieldWrap}>
                  <label className={labelClass} htmlFor="su-contact">Phone or email</label>
                  <input id="su-contact" required className={inputClass} value={signup.contact} onChange={(e) => setSignup((s) => ({ ...s, contact: e.target.value }))} />
                </div>
                <div className={fieldWrap}>
                  <label className={labelClass} htmlFor="su-area">Service area</label>
                  <input id="su-area" required placeholder="Zip code or neighborhood" className={inputClass} value={signup.area} onChange={(e) => setSignup((s) => ({ ...s, area: e.target.value }))} />
                </div>
                <div className={fieldWrap}>
                  <label className={labelClass}>Job types you&rsquo;re interested in</label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 pt-0.5">
                    {JOB_TYPE_OPTIONS.map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 text-[13.5px] text-[#55545C]">
                        <input type="checkbox" checked={prefs.includes(opt)} onChange={() => togglePref(opt)} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={fieldWrap}>
                  <label className={labelClass} htmlFor="su-password">Password</label>
                  <input id="su-password" type="password" required minLength={8} className={inputClass} value={signup.password} onChange={(e) => setSignup((s) => ({ ...s, password: e.target.value }))} />
                </div>
              </>
            ) : (
              <>
                <div className={fieldWrap}>
                  <label className={labelClass} htmlFor="si-contact">Phone or email</label>
                  <input id="si-contact" required className={inputClass} value={signin.contact} onChange={(e) => setSignin((s) => ({ ...s, contact: e.target.value }))} />
                </div>
                <div className={fieldWrap}>
                  <label className={labelClass} htmlFor="si-password">Password</label>
                  <input id="si-password" type="password" required className={inputClass} value={signin.password} onChange={(e) => setSignin((s) => ({ ...s, password: e.target.value }))} />
                </div>
              </>
            )}

            <button type="submit" className={primaryBtn}>
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </Animate>
      </main>
      <SiteFooter />
    </div>
  );
}

function ButlerDashboard({ butler, onLogout }: { butler: Butler; onLogout: () => void }) {
  const [, forceRender] = useState(0);
  const refresh = () => forceRender((n) => n + 1);

  const available = getAvailableJobsForButler(butler.id);
  const mine = getMyJobsForButler(butler.id);

  function handleAccept(jobId: string) {
    const ok = acceptJob(jobId, butler.id);
    if (!ok) window.alert('Sorry — that job was just taken.');
    refresh();
  }

  return (
    <div className="min-h-screen bg-[#FBF5EC] flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full max-w-[760px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-[#17161B] text-[24px] font-semibold">Welcome back, {butler.name.split(' ')[0]}</h1>
            <p className="text-[#55545C] text-[13.5px] mt-1">
              {butler.serviceArea ? `${butler.serviceArea} · ` : ''}Signed in as {butler.contact}
            </p>
          </div>
          <button onClick={onLogout} className="h-[38px] px-4 rounded-[10px] border border-black/15 text-[#17161B] text-[12.5px] font-medium hover:bg-black/5 transition-colors">
            Log out
          </button>
        </div>

        <section className="mb-10">
          <h2 className="text-[15px] font-semibold text-[#17161B] mb-3">
            Available jobs {available.length ? <span className="font-normal text-black/40">({available.length})</span> : null}
          </h2>
          {available.length ? (
            <div className="flex flex-col gap-2.5">
              {available.map((job) => (
                <JobTile key={job.id} job={job} matched={butler.jobTypePrefs.includes(job.service)} action={
                  <button onClick={() => handleAccept(job.id)} className="h-[34px] px-4 rounded-[8px] bg-[#0B0B0C] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity mt-3">
                    Accept job
                  </button>
                } />
              ))}
            </div>
          ) : (
            <EmptyState text="No open jobs right now — check back soon." />
          )}
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#17161B] mb-3">My jobs</h2>
          {mine.length ? (
            <div className="flex flex-col gap-2.5">
              {mine.map((job) => (
                <JobTile key={job.id} job={job} statusPill />
              ))}
            </div>
          ) : (
            <EmptyState text="Jobs you accept will show up here." />
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Approved: 'bg-[#71757C]/15 text-[#44474C]',
  Assigned: 'bg-[#0B0B0C]/10 text-[#0B0B0C]',
  Completed: 'bg-[#2c7a41]/15 text-[#2c7a41]',
};

function JobTile({ job, matched, statusPill, action }: { job: Job; matched?: boolean; statusPill?: boolean; action?: ReactNode }) {
  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[14.5px] font-semibold text-[#17161B]">{job.service || 'Job'}</div>
          <div className="text-[12.5px] text-black/45 mt-0.5">{job.address}</div>
        </div>
        {matched && (
          <span className="text-[10.5px] font-bold text-[#44474C] bg-[#ECEDEF] border border-black/10 rounded-full px-[9px] py-[3px] whitespace-nowrap">
            Matches your prefs
          </span>
        )}
        {statusPill && !matched && (
          <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-[10px] py-[3px] whitespace-nowrap ${STATUS_STYLES[job.status] ?? ''}`}>
            {job.status}
          </span>
        )}
      </div>
      {job.details && <p className="text-[13px] text-[#55545C] mt-2">{job.details}</p>}
      {action}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-black/15 rounded-[12px] bg-white text-center text-black/45 text-[13.5px] py-6 px-4">
      {text}
    </div>
  );
}
