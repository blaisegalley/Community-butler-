import { useState } from 'react';
import { reviewProfile, type ReviewableProfile } from '@/lib/profiles';
import { inputClass, labelClass, textareaClass } from '@/components/FormControls';

const STATUS_STYLES: Record<string, string> = {
  Draft: 'bg-graphite/15 text-[#44474C]',
  Pending: 'bg-[#C6602B]/15 text-[#8a4218]',
  Approved: 'bg-[#2c7a41]/15 text-[#2c7a41]',
  Rejected: 'bg-[#C4442E]/12 text-[#8c2f1c]',
};

const ANSWER_LABELS: [keyof ReviewableProfile['intake'], string][] = [
  ['grade', 'Year'],
  ['availability', 'Free'],
  ['experience', 'Experience'],
  ['goodAt', 'Good at'],
  ['why', 'Why'],
];

/**
 * One profile awaiting a decision.
 *
 * The manager sees the photo, the butler's own answers and the drafted
 * bio side by side, because the bio is machine-written from those
 * answers and the only way to catch it embellishing is to read both. The
 * bio and display name are editable here so fixing the wording is part
 * of approving rather than a second round trip.
 */
export default function ProfileReview({
  profile,
  onReviewed,
}: {
  profile: ReviewableProfile;
  onReviewed: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [note, setNote] = useState(profile.note);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(profile.status === 'Pending');

  async function decide(status: 'Approved' | 'Rejected') {
    if (status === 'Rejected' && !note.trim()) {
      window.alert('Add a note saying what needs fixing — otherwise they have nothing to act on.');
      return;
    }
    setBusy(true);
    try {
      await reviewProfile(profile.id, status, displayName, bio, note);
      onReviewed();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'Could not save that review.');
    } finally {
      setBusy(false);
    }
  }

  const answers = ANSWER_LABELS.filter(([key]) => profile.intake[key]);

  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4">
      <div className="flex items-start gap-3.5 flex-wrap">
        {profile.photoUrl ? (
          <img src={profile.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-black/10" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-sand border border-dashed border-black/20 flex items-center justify-center text-[11px] text-black/45 text-center px-1">
            No photo
          </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <div className="text-[14.5px] font-bold text-ink">
            {profile.name}
            {profile.displayName && profile.displayName !== profile.name && (
              <span className="font-normal text-black/45"> &middot; shown as {profile.displayName}</span>
            )}
          </div>
          <div className="text-[12.5px] text-black/45 mt-0.5">
            {profile.guardianConsent ? (
              <>Guardian: {profile.guardianName || 'name missing'} &middot; {profile.guardianContact || 'contact missing'}</>
            ) : (
              <span className="text-[#8c2f1c] font-medium">No guardian consent on file — cannot be published</span>
            )}
          </div>
        </div>
        <span
          className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-[10px] py-[3px] whitespace-nowrap ${
            STATUS_STYLES[profile.status] ?? ''
          }`}
        >
          {profile.status}
        </span>
      </div>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 h-[32px] px-3.5 rounded-[8px] border border-black/15 text-ink text-[12.5px] font-medium hover:bg-black/5 transition-colors"
        >
          Review
        </button>
      )}

      {open && (
        <div className="mt-4 pt-4 border-t border-black/10">
          {answers.length > 0 && (
            <div className="mb-4">
              <p className="text-[11.5px] uppercase tracking-wide text-black/40 font-semibold mb-1.5">
                What they wrote
              </p>
              <dl className="text-[13px] flex flex-col gap-1">
                {answers.map(([key, label]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="text-black/45 shrink-0 w-[84px]">{label}</dt>
                    <dd className="text-ink">{String(profile.intake[key])}</dd>
                  </div>
                ))}
                {profile.intake.prefs.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-black/45 shrink-0 w-[84px]">Wants</dt>
                    <dd className="text-ink">{profile.intake.prefs.join(', ')}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="mb-3">
            <label className={labelClass} htmlFor={`dn-${profile.id}`}>Name shown publicly</label>
            <input id={`dn-${profile.id}`} className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="mb-3">
            <label className={labelClass} htmlFor={`bio-${profile.id}`}>
              Bio — drafted from their answers, edit freely
            </label>
            <textarea id={`bio-${profile.id}`} rows={3} className={textareaClass} value={bio} onChange={(e) => setBio(e.target.value)} />
            <p className="text-[12px] text-black/45 mt-1">
              Check it against their answers above. If it says something they didn&rsquo;t, cut it.
            </p>
          </div>

          <div className="mb-4">
            <label className={labelClass} htmlFor={`note-${profile.id}`}>
              Note to the butler (required if sending back)
            </label>
            <input id={`note-${profile.id}`} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Photo is too dark — can you retake it?" />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => decide('Approved')}
              disabled={busy || !profile.guardianConsent}
              title={profile.guardianConsent ? undefined : 'Needs guardian consent first'}
              className="h-[32px] px-3.5 rounded-[8px] bg-ink text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Approve &amp; publish
            </button>
            <button
              onClick={() => decide('Rejected')}
              disabled={busy}
              className="h-[32px] px-3.5 rounded-[8px] border border-black/15 text-ink text-[12.5px] font-medium hover:bg-black/5 transition-colors disabled:opacity-40"
            >
              Send back
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-[32px] px-3.5 rounded-[8px] text-black/45 text-[12.5px] font-medium hover:bg-black/5 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
