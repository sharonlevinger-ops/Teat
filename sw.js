// יומן 2.0 – service worker: full offline support (app shell cached, cache-first).
const VERSION = 'yoman2-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/crypto.js',
  './js/db.js',
  './js/holidays.js',
  './js/icons.js',
  './js/lock.js',
  './js/parser.js',
  './js/store.js',
  './js/util.js',
  './js/voice.js',
  './js/maps.js',
  './js/views/addresses.js',
  './js/views/calendar.js',
  './js/views/documents.js',
  './js/views/settings.js',
  './js/views/tasks.js',
  './js/views/vault.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // navigation: serve the cached shell (works offline), refresh in background
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const net = fetch(req).then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put('./index.html', res.clone()));
          return res;
        }).catch(() => cached);
        return cached || net;
      }),
    );
    return;
  }

  // static assets: cache-first, stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || net;
    }),
  );
});
