/* Secretária Virtual — offline fallback only.
 *
 * This is deliberately NOT an offline-first cache. Every screen in this panel
 * renders member phone numbers, message bodies and prayer requests from the
 * database. Under the LGPD that is the church's members' personal data: caching
 * those responses would leave them readable on a shared parish phone after
 * logout, and would show a secretary a stale conversation she would answer as if
 * it were current. Neither failure is worth a slightly faster second load.
 *
 * So: no panel HTML, no RSC payload, no Server Action response and no API
 * response is ever stored. The only cached entry is the offline page, a static
 * document with no church data, served when a whole-page navigation fails for
 * lack of network.
 */
const CACHE = 'sv-offline-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' so a stale HTTP cache entry is not what gets stored.
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Whole-page navigations only. Everything else — RSC payloads, Server Action
  // POSTs, static chunks, blob uploads — goes straight to the network untouched.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(CACHE);
      const fallback = await cache.match(OFFLINE_URL);
      return fallback ?? new Response('Sem conexão.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
