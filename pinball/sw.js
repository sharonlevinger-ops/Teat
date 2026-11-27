// Forest & Castle Pinball – offline cache (stale-while-revalidate, scoped to /pinball/).
const VERSION = 'fcp-v11';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/main.js', './js/world.js', './js/physics.js', './js/layout.js', './js/textures.js', './js/game.js', './js/audio.js', './js/ui.js', './js/camera.js', './js/store.js',
  './vendor/three/three.module.min.js',
  './vendor/three/addons/postprocessing/EffectComposer.js', './vendor/three/addons/postprocessing/RenderPass.js', './vendor/three/addons/postprocessing/UnrealBloomPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js', './vendor/three/addons/postprocessing/ShaderPass.js', './vendor/three/addons/postprocessing/MaskPass.js', './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/shaders/CopyShader.js', './vendor/three/addons/shaders/LuminosityHighPassShader.js', './vendor/three/addons/shaders/OutputShader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './assets/concept.jpg', './assets/playfield.jpg', './assets/target0.png', './assets/target1.png', './assets/target2.png', './assets/mush_purple.png', './assets/mush_teal.png', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fcp-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((cached) => {
    const net = fetch(req).then((res) => { if (res.ok && res.type === 'basic') caches.open(VERSION).then((c) => c.put(req, res.clone())); return res; }).catch(() => cached);
    return cached || net;
  }));
});
