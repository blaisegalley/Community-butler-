import { FormEvent, useState } from 'react';
import {
  EMPTY_INTAKE,
  submitProfile,
  suggestDisplayName,
  type ButlerIntake,
  type ReviewableProfile,
} from '@/lib/profiles';
import { fieldWrap, inputClass, labelClass, primaryBtn, textareaClass } from '@/components/FormControls';

const JOB_TYPES = ['Yard work', 'Snow shoveling', 'Moving help', 'Junk hauling', 'Cleanouts', 'Dog walking', 'Odd jobs'];
const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
const AVAILABILITY = ['Weekends', 'After school', 'Weekends and after school', 'Summer only'];

const STATUS_COPY: Record<string, { title: string; body: string; tone: 'wait' | 'good' | 'bad' }> = {
  Pending: {
    title: 'Your profile is with a manager',
    body: 'Someone reads every profile before it goes on the site. You will see it on the Butlers page once it is approved.',
    tone: 'wait',
  },
  Approved: {
    title: 'Your profile is live',
    body: 'Neighbors can see you on the Butlers page. Edit it below any time — changes go back to a manager first.',
    tone: 'good',
  },
  Rejected: {
    title: 'A manager sent your profile back',
    body: 'Fix what they mentioned below and submit again.',
    tone: 'bad',
  },
};

export default function ProfileForm({
  butlerName,
  profile,
  onSubmitted,
}: {
  butlerName: string;
  profile: ReviewableProfile | null;
  onSubmitted: () => void;
}) {
  const status = profile?.status ?? 'Draft';
  const [open, setOpen] = useState(status === 'Draft' || status === 'Rejected');
  const [intake, setIntake] = useState<ButlerIntake>(profile?.intake ?? EMPTY_INTAKE);
  const [displayName, setDisplayName] = useState(
    profile?.displayName || suggestDisplayName(butlerName),
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(profile?.guardianConsent ?? false);
  const [guardianName, setGuardianName] = useState(profile?.guardianName ?? '');
  const [guardianContact, setGuardianContact] = useState(profile?.guardianContact ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = STATUS_COPY[status];

  function update<K extends keyof ButlerIntake>(key: K, value: ButlerIntake[K]) {
    setIntake((current) => ({ ...current, [key]: value }));
  }

  function togglePref(pref: string) {
    setIntake((current) => ({
      ...current,
      prefs: current.prefs.includes(pref)
        ? current.prefs.filter((p) => p !== pref)
        : [...current.prefs, pref],
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setBusy(true);
    setError('');
    try {
      await submitProfile({
        intake,
        displayName,
        photo,
        guardianConsent: consent,
        guardianName,
        guardianContact,
      });
      setOpen(false);
      onSubmitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4 mb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[14.5px] font-semibold text-ink">Your Butler profile</h2>
          {copy && (
            <p
              className={`text-[13px] mt-1 max-w-[60ch] ${
                copy.tone === 'good' ? 'text-[#2c7a41]' : copy.tone === 'bad' ? 'text-[#8c2f1c]' : 'text-graphite'
              }`}
            >
              <strong>{copy.title}.</strong> {copy.body}
            </p>
          )}
          {!copy && (
            <p className="text-[13px] text-graphite mt-1 max-w-[60ch]">
              Answer a few questions and we will write a short introduction for you. A manager checks it before it
              goes anywhere.
            </p>
          )}
          {status === 'Rejected' && profile?.note && (
            <p className="text-[13px] text-[#8c2f1c] mt-2">Manager&rsquo;s note: {profile.note}</p>
          )}
        </div>
        {profile?.photoUrl && (
          <img src={profile.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-black/10" />
        )}
      </div>

      {profile?.bio && !open && (
        <p className="text-[13.5px] text-ink mt-3 pt-3 border-t border-black/10">{profile.bio}</p>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 h-[36px] px-4 rounded-[9px] border border-black/15 text-ink text-[13px] font-medium hover:bg-black/5 transition-colors"
        >
          {profile?.bio ? 'Edit my profile' : 'Set up my profile'}
        </button>
      )}

      {open && (
        <form onSubmit={handleSubmit} noValidate className="mt-4 pt-4 border-t border-black/10">
          {error && (
            <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-display">
              Name neighbors will see
            </label>
            <input
              id="pf-display"
              required
              maxLength={40}
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-[12px] text-black/45 mt-1">
              First name and last initial is the norm here. Your full name stays private.
            </p>
          </div>

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-grade">Year in school</label>
            <select id="pf-grade" required className={inputClass} value={intake.grade} onChange={(e) => update('grade', e.target.value)}>
              <option value="">Choose one</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-avail">When are you usually free?</label>
            <select id="pf-avail" required className={inputClass} value={intake.availability} onChange={(e) => update('availability', e.target.value)}>
              <option value="">Choose one</option>
              {AVAILABILITY.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className={fieldWrap}>
            <label className={labelClass}>What kind of work do you want?</label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-0.5">
              {JOB_TYPES.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-[13.5px] text-graphite">
                  <input type="checkbox" checked={intake.prefs.includes(opt)} onChange={() => togglePref(opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-exp">Have you done work like this before?</label>
            <textarea id="pf-exp" rows={2} maxLength={400} className={textareaClass} value={intake.experience} onChange={(e) => update('experience', e.target.value)} placeholder="Mowed lawns for my street last summer, walked a neighbor's dog…" />
          </div>

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-good">What are you good at?</label>
            <textarea id="pf-good" rows={2} maxLength={400} className={textareaClass} value={intake.goodAt} onChange={(e) => update('goodAt', e.target.value)} placeholder="Showing up on time, heavy lifting, I like dogs…" />
          </div>

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-why">Why do you want to do this?</label>
            <textarea id="pf-why" rows={2} maxLength={400} className={textareaClass} value={intake.why} onChange={(e) => update('why', e.target.value)} placeholder="Saving for a car, like being outside…" />
          </div>

          <div className={fieldWrap}>
            <label className={labelClass} htmlFor="pf-photo">
              A photo of you (optional{profile?.photoUrl ? ' — you already have one' : ''})
            </label>
            <input
              id="pf-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-[13.5px]"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            <p className="text-[12px] text-black/45 mt-1">
              Not required. If you add one, use a clear photo of your face, like a school photo. Under 5MB.
            </p>
          </div>

          <div className={`${fieldWrap} rounded-[10px] bg-sand border border-black/10 p-3.5`}>
            <label className="flex items-start gap-2 text-[13.5px] text-ink">
              <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[3px]" />
              <span>
                A parent or guardian has agreed to my photo and first name being shown publicly on this website.
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className={labelClass} htmlFor="pf-gname">Their name</label>
                <input id="pf-gname" required className={inputClass} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-gcontact">Their phone or email</label>
                <input id="pf-gcontact" required className={inputClass} value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} />
              </div>
            </div>
            <p className="text-[12px] text-black/45 mt-2">
              A manager may check this before approving. It is never shown on the site.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="submit" className={primaryBtn} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
            {profile?.bio && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-[46px] px-5 rounded-[10px] border border-black/15 text-ink text-[13.5px] font-medium hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
