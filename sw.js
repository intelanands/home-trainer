/* Service worker: offline support.
   - App shell + images: cache-first (immutable-ish, bump VERSION to refresh)
   - data/*.json: network-first so plan updates from Claude arrive promptly */

const VERSION = 'v3';
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

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('trainer-shell-') && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
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

  // cache-first for shell and exercise images
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
