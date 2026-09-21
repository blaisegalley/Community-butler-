/*
 * Community Butler service worker.
 *
 * Built from this template by plugins/pwa.ts, which substitutes __BASE__
 * (the deployed path prefix) and __VERSION__ (a per-build cache buster).
 * Edit this file, not the emitted dist/sw.js.
 *
 * Two jobs:
 *   1. Make the app installable and usable with a bad connection.
 *   2. Receive Web Push messages and show them as notifications — this is
 *      the only code that runs when the app is closed, so butler job
 *      alerts and neighbour reminders both land here.
 */

const VERSION = '__VERSION__';
const BASE = '__BASE__';

const SHELL_CACHE = `cb-shell-${VERSION}`;
const ASSET_CACHE = `cb-assets-${VERSION}`;

// The four entry points, so a cold offline launch still renders something.
const SHELL_URLS = ['', 'request/', 'auth/', 'admin/'].map((path) => BASE + path);

// Hashed JS/CSS, injected at build time. Without these the cached HTML
// would load offline and then render nothing: the worker only starts
// controlling the page after the first visit's requests have already gone
// out, so nothing would land in the runtime cache on that visit.
const BUILD_ASSETS = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one bad URL doesn't abort the whole install the
      // way cache.addAll() would.
      const urls = SHELL_URLS.concat(BUILD_ASSETS);
      await Promise.all(urls.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('cb-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/*
 * Cache lookup that ignores Vary.
 *
 * cache.add() stores a no-cors request with no Origin header, but the page
 * asks for its module scripts with crossorigin set, which does send one.
 * A server answering `Vary: Origin` therefore makes the default match miss
 * every precached asset, and the app loads offline as a blank page. We only
 * ever cache our own same-origin build output, so Vary tells us nothing.
 */
function match(request) {
  return caches.match(request, { ignoreVary: true });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first: a freshly deployed page should always beat a cached
    // one. The cache is only the offline fallback.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = (await match(request)) || (await match(BASE));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Build assets carry a content hash, so a cached copy can never be
  // stale: serve it immediately and refresh in the background.
  event.respondWith(
    (async () => {
      const cached = await match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

// ---------- Web Push ----------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Community Butler';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: BASE + 'icon-192.png',
      badge: BASE + 'icon-192.png',
      // Same tag replaces an earlier notification instead of stacking, so
      // a butler opening their phone sees one current alert per job.
      tag: payload.tag || 'community-butler',
      data: { url: payload.url || BASE },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || BASE, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => client.url === target);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })(),
  );
});
