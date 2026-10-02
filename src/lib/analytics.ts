/*
 * Page view tracking.
 *
 * The narrowest thing that answers "is anyone looking at this site, and
 * are they neighbours or butlers": a path, a coarse viewer kind, and a
 * referrer host. No cookie, no id, no fingerprint, nothing that could
 * reconstruct one person's browsing.
 *
 * It also never blocks or breaks a page. A failed view record is worth
 * nothing and a broken page costs a job.
 */

import { isBackendConfigured } from '@/lib/backendConfig';

/** Honours the browser's Do Not Track setting. It costs us nothing to. */
function trackingRefused(): boolean {
  if (typeof navigator === 'undefined') return true;
  const dnt =
    navigator.doNotTrack ??
    (window as unknown as { doNotTrack?: string }).doNotTrack ??
    (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

/** Host only. A full referrer URL can carry the search terms someone typed. */
function referrerHost(): string {
  try {
    if (!document.referrer) return '';
    const url = new URL(document.referrer);
    if (url.hostname === window.location.hostname) return '';
    return url.hostname;
  } catch {
    return '';
  }
}

export async function recordPageView(): Promise<void> {
  if (!isBackendConfigured() || trackingRefused()) return;

  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase().rpc('record_page_view', {
      p_path: window.location.pathname,
      p_referrer_host: referrerHost(),
    });
  } catch {
    // Analytics is never worth surfacing to a visitor, or retrying.
  }
}
