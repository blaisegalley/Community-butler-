import { useEffect, useState } from 'react';
import { enablePush, pushBlockerMessage, pushState, type PushState, type PushTarget } from '@/lib/push';

interface NotifyButtonProps {
  target: PushTarget;
  label: string;
  /** One line on what turning this on will actually get them. */
  hint: string;
  onLabel: string;
  tone?: 'light' | 'dark';
}

/**
 * Turns Web Push on for whoever this is rendered for.
 *
 * It says plainly when notifications can't work rather than showing a
 * button that quietly does nothing — most often on iPhone, where Safari
 * has no push at all until the app is on the home screen.
 */
export default function NotifyButton({ target, label, hint, onLabel, tone = 'light' }: NotifyButtonProps) {
  const [state, setState] = useState<PushState>(() => pushState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const key = 'butlerId' in target ? target.butlerId : target.jobId;

  useEffect(() => {
    // Permission already granted on an earlier visit means we can
    // re-register silently — no prompt is shown. Worth doing, because the
    // browser can retire a subscription at any time and the person would
    // never know why the alerts stopped.
    if (pushState() !== 'on') return;
    let cancelled = false;
    enablePush(target)
      .then((next) => !cancelled && setState(next))
      .catch(() => {
        /* a silent re-register failing is not worth interrupting anyone */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function turnOn() {
    setBusy(true);
    setError('');
    try {
      setState(await enablePush(target));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }

  const blocker = pushBlockerMessage(state);
  const muted = tone === 'dark' ? 'text-white/55' : 'text-black/45';
  const strong = tone === 'dark' ? 'text-white' : 'text-ink';

  if (blocker) {
    return <p className={`text-[12.5px] leading-relaxed ${muted}`}>{blocker}</p>;
  }

  if (state === 'on') {
    return (
      <p className={`text-[12.5px] leading-relaxed ${muted}`}>
        <span className={`font-medium ${strong}`}>{onLabel}</span> You can turn these off any time
        in your browser settings.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={turnOn}
        disabled={busy}
        className={`h-[38px] px-4 rounded-[10px] text-[13px] font-medium transition-opacity disabled:opacity-40 ${
          tone === 'dark' ? 'bg-white text-ink' : 'bg-ink text-white'
        } hover:opacity-90`}
      >
        {busy ? 'Turning on…' : label}
      </button>
      <p className={`text-[12.5px] leading-relaxed mt-2 ${muted}`}>{hint}</p>
      {error && <p className="text-[12.5px] text-[#C4442E] mt-1.5">{error}</p>}
    </div>
  );
}
