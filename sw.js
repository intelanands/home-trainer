/* KILL SWITCH — the service worker is retired (July 2026).
   Offline-first caching caused every update/auth headache this app had
   (stale versions, devices stuck behind the login wall) and the user
   trains at home with connectivity, so it bought nothing.

   This file must KEEP EXISTING at this path: devices still running an old
   service worker fetch it on their update checks. When it installs, it
   wipes every cache, unregisters itself, and reloads its windows — after
   which the device is a plain fresh-from-server website. Do not add a
   caching service worker back. */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.navigate(client.url);
  })());
});
