// Bootstrap: renderer, post-processing, input, main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Physics } from './physics.js';
import { World, V } from './world.js';
import { Game } from './game.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { CameraRig, MODES } from './camera.js';
import * as L from './layout.js';

const $ = (s) => document.querySelector(s);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const CAM_KEY = 'fcp_cam2';

async function boot() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // keep the concept art's exact colours
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  $('#loadTxt').textContent = 'בונים את היער…';
  await nextFrame();
  const physics = new Physics();
  const world = new World(renderer);
  $('#loadTxt').textContent = 'מדליקים את הלהבה הכחולה…';
  await nextFrame();

  const rig = new CameraRig(innerWidth / innerHeight);
  try { const c = +localStorage.getItem(CAM_KEY); if (c >= 0 && c < MODES.length) { rig.set(c); rig.snap(); } } catch { /* ignore */ }
  world.camera = rig.cam;

  // post-processing: MSAA scene target + bloom for the glowing magic
  const size = new THREE.Vector2(innerWidth, innerHeight);
  const rt = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.addPass(new RenderPass(world.scene, rig.cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const sound = new Sound();
  const ui = new UI();
  const game = new Game(physics, world, sound, ui);
  world.update(0.016, physics, game);
  renderer.compile(world.scene, rig.cam);

  const tilt = new THREE.Matrix4().makeRotationX(world.table.rotation.x);
  const tmp = new THREE.Vector3();
  ui.project = (x, y, h) => {
    tmp.copy(V(x, y, h)).applyMatrix4(tilt).project(rig.cam);
    return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight };
  };

  // ---------------------------------------------------------------- resize
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    rig.setAspect(w / h);
  }
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---------------------------------------------------------------- input
  const touchSide = new Map();
  let paused = false;
  const sideCount = { L: 0, R: 0 };
  function flip(side, down) {
    const was = sideCount[side] > 0;
    sideCount[side] = Math.max(0, sideCount[side] + (down ? 1 : -1));
    const now = sideCount[side] > 0;
    if (was === now) return;
    physics.setFlipper(side, now);
    if (game.state === 'playing' && !paused) {
      sound.play(now ? 'flipper' : 'flipperDown');
      if (now) game.laneChange(side === 'L' ? -1 : 1);
    }
  }
  let pulling = false, pullStartT = 0;
  let dragY0 = null, dragPull = null; // drag-down on the plunger = manual power
  function plungerDown(y) { if (!game.ballInLane() || paused) return; pulling = true; pullStartT = performance.now(); dragY0 = y ?? null; dragPull = null; sound.play('pull'); }
  function plungerUp() {
    if (!pulling) return; pulling = false;
    const quick = dragPull === null && performance.now() - pullStartT < 180;
    game.plungerLaunch(quick ? 0.62 : physics.plunger.pull);
    dragY0 = dragPull = null;
    releaseT = 0.12;
  }
  let releaseT = 0;

  const isUI = (el) => el && el.closest && el.closest('button, .card');
  window.addEventListener('touchstart', (e) => {
    sound.unlock();
    if (isUI(e.target)) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const side = t.clientX < innerWidth / 2 ? 'L' : 'R';
      touchSide.set(t.identifier, side); flip(side, true);
    }
  }, { passive: false });
  const endTouch = (e) => {
    sound.unlock();
    for (const t of e.changedTouches) { const side = touchSide.get(t.identifier); if (side) { touchSide.delete(t.identifier); flip(side, false); } }
    if (!isUI(e.target)) e.preventDefault();
  };
  window.addEventListener('touchend', endTouch, { passive: false });
  window.addEventListener('touchcancel', endTouch, { passive: false });
  window.addEventListener('touchmove', (e) => { if (!isUI(e.target) || e.target.closest('#plunger')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  // mouse (desktop testing)
  window.addEventListener('mousedown', (e) => { sound.unlock(); if (isUI(e.target) || e.sourceCapabilities?.firesTouchEvents) return; const s = e.clientX < innerWidth / 2 ? 'L' : 'R'; touchSide.set('m', s); flip(s, true); });
  window.addEventListener('mouseup', () => { const s = touchSide.get('m'); if (s) { touchSide.delete('m'); flip(s, false); } });
  // keyboard
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    sound.unlock();
    if (keys.has(e.code)) return; keys.add(e.code);
    if (['KeyZ', 'ShiftLeft', 'ArrowLeft'].includes(e.code)) flip('L', true);
    if (['Slash', 'ShiftRight', 'ArrowRight'].includes(e.code)) flip('R', true);
    if (['Space', 'Enter', 'ArrowDown'].includes(e.code)) plungerDown();
    if (e.code === 'KeyC') camNext();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (['KeyZ', 'ShiftLeft', 'ArrowLeft'].includes(e.code)) flip('L', false);
    if (['Slash', 'ShiftRight', 'ArrowRight'].includes(e.code)) flip('R', false);
    if (['Space', 'Enter', 'ArrowDown'].includes(e.code)) plungerUp();
  });

  const pl = $('#plunger');
  pl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); sound.unlock(); plungerDown(e.changedTouches[0].clientY); }, { passive: false });
  pl.addEventListener('touchmove', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!pulling || dragY0 === null) return;
    const d = e.changedTouches[0].clientY - dragY0;
    if (dragPull !== null || Math.abs(d) > 8) dragPull = Math.max(0, Math.min(1, d / 110));
  }, { passive: false });
  pl.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); plungerUp(); }, { passive: false });
  pl.addEventListener('mousedown', (e) => { e.stopPropagation(); plungerDown(); });
  pl.addEventListener('mouseup', (e) => { e.stopPropagation(); plungerUp(); });
  pl.addEventListener('mouseleave', () => plungerUp());

  const tap = (sel, fn) => { const el = $(sel); el.addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.play('click'); fn(); }); };
  function camNext() { const m = rig.next(); ui.cameraName(m.name); try { localStorage.setItem(CAM_KEY, String(rig.mode)); } catch { /* ignore */ } }
  tap('#btnCam', camNext);
  const muteBtn = $('#btnMute');
  const syncMute = () => { muteBtn.textContent = sound.muted ? '🔇' : '🔊'; };
  syncMute();
  tap('#btnMute', () => { sound.setMuted(!sound.muted); syncMute(); });
  function togglePause() {
    if (game.state !== 'playing') return;
    paused = !paused;
    $('#pause').classList.toggle('show', paused);
    if (paused) sound.stopMusic(); else sound.startMusic();
  }
  tap('#btnPause', togglePause);
  tap('#btnResume', togglePause);
  tap('#btnQuit', () => { paused = false; $('#pause').classList.remove('show'); game.gameOver(); });
  function start() {
    ui.hideTitle(); ui.hideOver();
    sound.unlock(); sound.startMusic();
    game.startGame();
    const h = $('#hint'); h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 4500);
  }
  tap('#btnStart', start);
  tap('#btnAgain', start);
  tap('#btnMenu', () => { ui.hideOver(); ui.renderTitle(game.best); game.state = 'attract'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing' && !paused) togglePause(); });

  // ---------------------------------------------------------------- loop
  ui.renderTitle(game.best);
  $('#loading').classList.add('hide');
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0, lowT = 0;
  const ballW = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.016;
    if (!paused) {
      if (pulling) physics.plunger.pull = dragPull !== null ? dragPull : Math.min(1, (performance.now() - pullStartT) / 1000);
      else if (releaseT > 0) { releaseT -= dt; physics.plunger.pull = Math.max(0, physics.plunger.pull - dt * 14); }
      else physics.plunger.pull = Math.max(0, physics.plunger.pull - dt * 6);
      physics.step(dt);
      game.update(dt);
      if (game.state === 'attract') attractLamps(world, now);
    }
    ui.setPlunger(game.state === 'playing' && game.ballInLane(), physics.plunger.pull);
    world.update(paused ? 0 : dt, physics, game);
    // camera follows the lowest (most dangerous) ball
    let fb = null;
    for (const b of physics.balls) if (b.mode !== 'held' && (!fb || b.y > fb.y)) fb = b;
    if (fb) { ballW.copy(world.ballWorld(fb)).applyMatrix4(tilt); }
    rig.update(dt, fb ? ballW : null);
    composer.render();
    ui.update(game);
    // adaptive quality: drop resolution if the device can't keep ~55 fps
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 50 && pixelRatio > 1.1) { lowT++; if (lowT >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); resize(); lowT = 0; } } else lowT = 0;
    }
  }
  requestAnimationFrame(frame);
  window.__pinball = { game, physics, world, rig, ui, sound, start };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

function attractLamps(world, now) {
  const t = now / 1000;
  let i = 0;
  for (const l of world.lamps.values()) { l.set(Math.sin(t * 3 - i * 0.7) > 0.3 ? 1 : 0); i++; }
}

boot().catch((e) => {
  console.error(e);
  $('#loadTxt').textContent = 'שגיאה בטעינה: ' + e.message;
});
