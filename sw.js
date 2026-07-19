/* Service worker: offline support.
   - App shell: cache-first from the VERSIONED shell cache only (bump VERSION
     on any shell change). Never served from the runtime cache — a stale shell
     copy there would otherwise shadow updates forever.
   - Exercise images: cache-first via runtime cache (immutable content).
   - data/*.json: network-first so plan updates from Claude arrive promptly. */

const VERSION = 'v12';
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
  if (url.pathname.includes('/api/')) return; // history sync/auth — never cached
  if (url.pathname.endsWith('/login.html')) return; // login wall page — never cached

  // Only genuine same-origin 200s get cached. The nginx login wall serves
  // login.html (marked X-Gym-Login) in place of ANY unauthenticated URL —
  // caching that would poison the app shell/data with the login page.
  const cacheable = (res, wantJson) => {
    if (!res.ok || res.redirected) return false;
    if (res.headers.get('X-Gym-Login')) return false;
    const type = res.headers.get('content-type') || '';
    if (wantJson) return type.includes('json');
    return !type.includes('text/html');
  };

  if (url.pathname.includes('/data/')) {
    // network-first: fresh plan when online, cached plan when offline/blocked
    e.respondWith(
      fetch(e.request).then(async res => {
        if (cacheable(res, true)) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy));
          return res;
        }
        return (await caches.match(e.request)) || res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (SHELL_PATHS.has(url.pathname)) {
    // shell: only ever from the versioned shell cache. Query-string requests
    // (./?signin=...) intentionally bypass the cache to reach the network,
    // and must not be cached under that key.
    e.respondWith(
      caches.match(e.request, { cacheName: SHELL_CACHE }).then(hit =>
        hit || fetch(e.request).then(res => {
          if (cacheable(res, false) && !url.search) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        }))
    );
    return;
  }

  // cache-first for exercise images and everything else
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (cacheable(res, false)) {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
