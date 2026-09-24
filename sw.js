// Bumped v5 -> v6 on 2026-09-24: the cache-first fetch handler means a device
// that cached a broken/older shell keeps serving it. A version bump makes the
// activate step delete the old caches, so the device picks up the current tool.
const CACHE_VERSION = 'rss-sales-v6';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const PDF_CACHE   = CACHE_VERSION + '-pdfs';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/pdfs/') && url.pathname.endsWith('.pdf')) {
    event.respondWith((async () => {
      const cache = await caches.open(PDF_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const stale = await cache.match(req);
        if (stale) return stale;
        throw err;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req);
    if (hit) {
      fetch(req).then(fresh => { if (fresh.ok) cache.put(req, fresh); }).catch(()=>{});
      return hit;
    }
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fb = await cache.match('./index.html');
        if (fb) return fb;
      }
      throw err;
    }
  })());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'prewarm' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(PDF_CACHE);
      for (const u of data.urls) {
        try {
          const already = await cache.match(u);
          if (already) continue;
          const res = await fetch(u);
          if (res.ok) await cache.put(u, res.clone());
        } catch (_) {}
      }
    })());
  }
});

