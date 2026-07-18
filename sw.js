/* Service worker: offline support.
   - App shell: cache-first from the VERSIONED shell cache only (bump VERSION
     on any shell change). Never served from the runtime cache — a stale shell
     copy there would otherwise shadow updates forever.
   - Exercise images: cache-first via runtime cache (immutable content).
   - data/*.json: network-first so plan updates from Claude arrive promptly. */

const VERSION = 'v5';
const SHELL_CACHE = `trainer-shell-${VERSION}`;
const RUNTIME_CACHE = 'trainer-runtime';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/timer.js',
  './js/history.js',
  './js/player.js',
  './js/app.js',
  './manifest.json',
  './img/icon.svg',
];

const SHELL_PATHS = new Set(SHELL.map(p => new URL(p, self.location).pathname));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('trainer-shell-') && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
    );
    // Heal installs where shell files leaked into the runtime cache
    // (they would shadow every future shell update).
    const runtime = await caches.open(RUNTIME_CACHE);
    for (const req of await runtime.keys()) {
      if (SHELL_PATHS.has(new URL(req.url).pathname)) await runtime.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/data/')) {
    // network-first: fresh plan when online, cached plan when offline
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (SHELL_PATHS.has(url.pathname)) {
    // shell: only ever from the versioned shell cache
    e.respondWith(
      caches.match(e.request, { cacheName: SHELL_CACHE }).then(hit =>
        hit || fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
          return res;
        }))
    );
    return;
  }

  // cache-first for exercise images and everything else
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
