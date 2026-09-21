import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

const SW_TEMPLATE = fileURLToPath(new URL('../pwa/sw.js', import.meta.url));

/**
 * Emits manifest.webmanifest and sw.js with the deploy path baked in.
 *
 * Neither file can be a plain public/ asset: Vite copies those verbatim,
 * and both need to know `base`. Hardcoding '/Community-butler-/' in them
 * would silently break the day the site moves to its own domain.
 */
export default function pwa(): Plugin {
  let base = '/';

  const manifest = () => ({
    name: 'Community Butler',
    short_name: 'Butler',
    description:
      'Post a neighbourhood job in two minutes, or pick up work as a local Butler.',
    start_url: base,
    scope: base,
    display: 'standalone',
    background_color: '#0B0F0D',
    theme_color: '#0B0F0D',
    icons: [
      { src: base + 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: base + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: base + 'icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Post a job', url: base + 'request/' },
      { name: 'Butler sign in', url: base + 'auth/' },
    ],
  });

  const serviceWorker = (precache: string[]) => {
    const source = readFileSync(SW_TEMPLATE, 'utf8');
    // The worker's own bytes decide the cache version, so a deploy that
    // doesn't change the worker doesn't needlessly evict warm caches.
    const version = createHash('sha256')
      .update(source)
      .update(base)
      .update(precache.join(','))
      .digest('hex')
      .slice(0, 8);
    return source
      .replaceAll('__BASE__', base)
      .replaceAll('__VERSION__', version)
      .replaceAll('__PRECACHE__', JSON.stringify(precache));
  };

  return {
    name: 'community-butler-pwa',
    configResolved(config) {
      base = config.base;
    },
    // Vite rewrites <link href> only for extensions it recognises as
    // assets, and .webmanifest isn't one — a literal "/manifest.webmanifest"
    // would 404 wherever base isn't "/". Inject it with the prefix applied.
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'manifest', href: base + 'manifest.webmanifest' },
          injectTo: 'head' as const,
        },
      ];
    },
    generateBundle(_options, bundle) {
      const precache = Object.keys(bundle)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        .map((name) => base + name);

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(manifest(), null, 2),
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(precache) });
    },
    // `vite dev` never reaches generateBundle, and the app registers the
    // worker in production only — but serving both here keeps the dev
    // server honest if you want to flip that flag while debugging.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path === base + 'manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(manifest(), null, 2));
          return;
        }
        if (path === base + 'sw.js') {
          res.setHeader('Content-Type', 'text/javascript');
          res.end(serviceWorker([]));
          return;
        }
        next();
      });
    },
  };
}
