import { useEffect, useState } from 'react';
import { useInstallState } from '@/lib/pwa';

const DISMISS_KEY = 'cb.installDismissed.v1';
// Long enough not to interrupt the hero video, short enough that someone
// skimming the page still sees it.
const APPEAR_DELAY_MS = 6000;

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Invites the visitor to install the app. Installing is what makes push
 * notifications possible at all on iPhone, so this isn't decoration —
 * a butler who never adds the app to their home screen never gets a job
 * alert.
 */
export default function InstallPrompt() {
  const { state, install } = useInstallState();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed || !visible) return null;
  if (state === 'installed' || state === 'unsupported') return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — it'll reappear next visit, which is acceptable */
    }
  }

  async function onInstall() {
    if (state === 'manual') {
      setShowIOSSteps((open) => !open);
      return;
    }
    const accepted = await install();
    if (accepted) dismiss();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-[520px] rounded-2xl bg-ink/95 backdrop-blur border border-white/15 shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="w-10 h-10 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-white text-[15px] font-medium leading-snug">Add Community Butler to your phone</p>
            <p className="text-silver text-[13px] leading-snug mt-0.5">
              Get a notification the moment a job is posted or confirmed.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className={`shrink-0 -mt-1 -mr-1 w-11 h-11 flex items-center justify-center text-silver hover:text-white rounded-full ${focusRing}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>

        {showIOSSteps && (
          <ol className="mt-3 text-silver text-[13px] leading-relaxed list-decimal pl-5 space-y-1">
            <li>
              Tap the Share button at the bottom of Safari — the square with an arrow pointing up.
            </li>
            <li>Scroll down and tap <span className="text-white">Add to Home Screen</span>.</li>
            <li>Tap <span className="text-white">Add</span>. The bowtie icon appears with your other apps.</li>
          </ol>
        )}

        <button
          type="button"
          onClick={onInstall}
          className={`mt-3 w-full bg-sand text-ink rounded-full px-6 py-3 text-sm font-medium uppercase tracking-[0.04em] hover:bg-white transition-colors ${focusRing}`}
        >
          {state === 'manual' ? (showIOSSteps ? 'Hide steps' : 'Show me how') : 'Install'}
        </button>
      </div>
    </div>
  );
}
