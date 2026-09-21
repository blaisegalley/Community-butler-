import { useEffect, useState } from 'react';
import { withBase } from '@/lib/url';

/**
 * Chrome's install event. It isn't in lib.dom, and it's the only way to
 * trigger an install from a button — the browser fires it once, and the
 * prompt must be shown from a user gesture afterwards.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar so the in-page banner is the
    // single install affordance.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((notify) => notify());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((notify) => notify());
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's non-standard flag, still the only signal on iOS.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export type InstallState = 'installed' | 'available' | 'manual' | 'unsupported';

/**
 * Whether and how this browser can install the app.
 *   installed   — already running from the home screen
 *   available   — we hold a prompt event and can install on tap
 *   manual      — iOS Safari: possible, but only via Share ▸ Add to Home Screen
 *   unsupported — desktop browsers with no install path
 */
export function useInstallState(): { state: InstallState; install: () => Promise<boolean> } {
  const [, forceRender] = useState(0);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const notify = () => forceRender((n) => n + 1);
    listeners.add(notify);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(notify);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  let state: InstallState = 'unsupported';
  if (installed) state = 'installed';
  else if (deferredPrompt) state = 'available';
  else if (isIOS()) state = 'manual';

  async function install(): Promise<boolean> {
    if (!deferredPrompt) return false;
    const prompt = deferredPrompt;
    // The event is single-use; drop it before awaiting so a double tap
    // can't fire it twice.
    deferredPrompt = null;
    listeners.forEach((notify) => notify());
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome === 'accepted';
  }

  return { state, install };
}

/**
 * Registers the service worker that backs offline use and push messages.
 * Dev builds skip it: a worker caching unhashed dev modules makes hot
 * reload lie about what's on screen.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(withBase('sw.js'), { scope: import.meta.env.BASE_URL }).catch(() => {
      // An unregistrable worker costs offline support and push, but the
      // app itself still works — don't surface it.
    });
  });
}
