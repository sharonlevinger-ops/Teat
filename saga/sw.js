// Forest Pinball Saga – offline support: the whole game (code, painting, sprites, fonts) is cached; cache-first.
const VERSION = 'forest-saga-0.8.0';
const SHELL = ['./', './art/btn-camera.png', './art/btn-pause.png', './art/ext-bottom.jpg', './art/ext-top.jpg', './art/flipper-l.png', './art/flipper-r.png', './art/playfield.jpg', './art/sprites/ball.png', './art/sprites/crystal1.png', './art/sprites/crystal2.png', './art/sprites/mush1.png', './art/sprites/mush2.png', './art/sprites/mush3.png', './art/sprites/pedestal.png', './art/sprites/potion.png', './art/sprites/slingL.png', './art/sprites/slingR.png', './art/sprites/tower.png', './art/sprites/wizard.png', './css/style.css', './fonts/cinzel-700.woff2', './fonts/cinzel-decorative-700.woff2', './fonts/orbitron-800.woff2', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './index.html', './js/audio/audio.js', './js/core/artmap.js', './js/core/config.js', './js/core/events.js', './js/core/physics.js', './js/core/rules.js', './js/core/sim.js', './js/core/table.js', './js/main.js', './js/render/chapters.js', './js/render/effects.js', './js/render/grade.js', './js/render/layers.js', './js/render/sprite-meta.js', './js/render/stage.js', './js/ui/hud.js', './js/ui/input.js', './js/ui/messages.js', './js/ui/report.js', './js/ui/tuning.js', './js/vendor/three.module.min.js', './js/version.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('forest-saga-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => cached || fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
