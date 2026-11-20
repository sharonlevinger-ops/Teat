// Forest Pinball Saga – offline support: the whole game (code, fonts, icons) is cached; cache-first.
const VERSION = 'pinball-saga-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/main.js', './js/vendor/three.module.min.js',
  './js/vendor/jsm/postprocessing/EffectComposer.js', './js/vendor/jsm/postprocessing/RenderPass.js', './js/vendor/jsm/postprocessing/ShaderPass.js',
  './js/vendor/jsm/postprocessing/UnrealBloomPass.js', './js/vendor/jsm/postprocessing/OutputPass.js', './js/vendor/jsm/postprocessing/Pass.js',
  './js/vendor/jsm/postprocessing/MaskPass.js', './js/vendor/jsm/shaders/CopyShader.js', './js/vendor/jsm/shaders/LuminosityHighPassShader.js',
  './js/vendor/jsm/shaders/OutputShader.js',
  './js/core/config.js', './js/core/events.js', './js/core/physics.js', './js/core/rules.js', './js/core/sim.js', './js/core/table.js',
  './js/render/scene.js', './js/render/textures.js', './js/render/themes.js', './js/render/particles.js',
  './js/audio/audio.js', './js/ui/hud.js', './js/ui/input.js',
  './fonts/cinzel-700.woff2', './fonts/cinzel-decorative-700.woff2', './fonts/orbitron-800.woff2',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pinball-saga-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return cached || net;
    }),
  );
});
