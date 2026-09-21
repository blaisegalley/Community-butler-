import { isIOS, isStandalone } from '@/lib/pwa';
import { isShared, savePushSubscription } from '@/lib/store';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export type PushState =
  /** This browser has no Web Push at all. */
  | 'unsupported'
  /** iOS only sends push to a PWA on the home screen. */
  | 'needs-install'
  /** No database, so nothing exists to send a notification about. */
  | 'no-backend'
  /** Push keys were not configured at build time. */
  | 'not-configured'
  /** The person said no. Only they can undo it, in browser settings. */
  | 'blocked'
  /** Available, not yet turned on. */
  | 'off'
  /** Turned on. */
  | 'on';

/**
 * The VAPID public key travels as base64url but subscribe() wants bytes.
 *
 * Returns an ArrayBuffer rather than a Uint8Array: lib.dom types the
 * parameter as a BufferSource over a plain ArrayBuffer, which a
 * Uint8Array<ArrayBufferLike> does not satisfy.
 */
function decodeKey(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function pushState(): PushState {
  if (!isShared) return 'no-backend';
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // On iPhone this is what an uninstalled Safari tab looks like: the
    // APIs simply aren't there until the app is on the home screen.
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') return 'on';
  return 'off';
}

export type PushTarget = { butlerId: string } | { jobId: string };

/**
 * Asks permission, subscribes this browser, and stores the subscription
 * against whoever it belongs to.
 *
 * Returns the state afterwards so the caller can say something true:
 * 'on' means notifications will actually arrive, and every other value
 * names the reason they won't.
 */
export async function enablePush(target: PushTarget): Promise<PushState> {
  const state = pushState();
  if (state !== 'off' && state !== 'on') return state;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription where there is one: re-subscribing
  // mints a new endpoint and orphans the row already in the database.
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Required by Chrome: every push must result in a visible
      // notification. We only ever send visible ones anyway.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY as string),
    }));

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    return 'unsupported';
  }

  await savePushSubscription(target, {
    endpoint: payload.endpoint,
    p256dh: payload.keys.p256dh,
    auth: payload.keys.auth,
  });

  return 'on';
}

/** A sentence explaining why notifications aren't available, or null. */
export function pushBlockerMessage(state: PushState): string | null {
  switch (state) {
    case 'needs-install':
      return 'On iPhone, notifications only work once the app is on your home screen. Tap Share, then Add to Home Screen, and open it from there.';
    case 'unsupported':
      return "This browser can't receive notifications. Try Chrome on Android, or install the app on iPhone.";
    case 'blocked':
      return 'Notifications are blocked for this site. You can turn them back on in your browser settings.';
    case 'no-backend':
      return 'Notifications need the shared database to be connected first — see SETUP.md.';
    case 'not-configured':
      return 'Notification keys have not been set up yet — see SETUP.md.';
    default:
      return null;
  }
}
