const CACHE = 'reckeweg-v3';

// Install: skipWaiting immediato, NESSUN caching in install
// (evita errori 401 se il reverse proxy ha auth)
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API e data.js: sempre dal network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data.js')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Tutto il resto: cache-first con fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(resp => {
        // Solo risposte valide vanno in cache
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          // CLONE prima di qualsiasi operazione asincrona
          const respToCache = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, respToCache));
        }
        return resp;
      }).catch(() => {
        // Fallback silenzioso
        return new Response('', { status: 503 });
      });
    })
  );
});