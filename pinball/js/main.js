// Forest Pinball Saga – bootstrap and main loop.
// Architecture:  core/ (simulation: physics + rules, no DOM)  --EventBus-->  render/ audio/ ui/ (presentation)
import { Simulation } from './core/sim.js';
import { STEP } from './core/config.js';
import { GameRenderer } from './render/scene.js';
import { waitForFonts } from './render/textures.js';
import { AudioEngine } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('fps.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fps.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

async function boot() {
  await waitForFonts();
  const settings = Object.assign({ camera: 'classic', music: 55, sfx: 85, quality: 'auto', fps: false }, store.get('settings', {}));

  const sim = new Simulation();
  sim.rules.highScore = store.get('high', 0);
  const bus = sim.bus;

  const hudEl = $('hud');
  const renderer = new GameRenderer($('game'), sim, {
    getTopInset: () => hudEl.getBoundingClientRect().bottom + 4,
    getBottomInset: () => 26,
  });
  renderer.bind(bus);
  const hud = new Hud(sim, renderer);
  hud.bind(bus);
  const audio = new AudioEngine();
  audio.musicVolume = settings.music / 100;
  audio.sfxVolume = settings.sfx / 100;

  // ------------------------------------------------------------------ state / overlays
  let paused = false;
  let gameOverAt = 0;
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const overlayOpen = () => !$('pause').classList.contains('hidden') || !$('settings').classList.contains('hidden');

  const musicFor = () => {
    const r = sim.rules;
    if (r.state !== 'playing') return 'ch1';
    return r.multiball ? 'multiball' : 'ch' + r.stage.id;
  };
  const refreshMusic = () => { if (audio.ready) { audio.playMusic(musicFor()); audio.setRushLayer(sim.rules.state === 'playing' && sim.rules.rushActive); } };

  const updateBest = () => { $('title-best').textContent = sim.rules.highScore ? `BEST  ${sim.rules.highScore.toLocaleString('en-US')}` : ''; };
  updateBest();

  function startGame() {
    audio.unlock();
    show('title', false);
    show('gameover', false);
    hud.resetScore();
    sim.rules.startGame();
    refreshMusic();
  }

  function setPaused(on) {
    if (sim.rules.state !== 'playing') on = false;
    paused = on;
    show('pause', on);
    if (on) { input.releaseAll(); audio.suspend(); } else audio.resume();
  }

  // a tap anywhere on the title / game-over screen starts a game (the starting tap never flips)
  const onAnyTap = () => {
    audio.unlock();
    if (!$('title').classList.contains('hidden')) { startGame(); return true; }
    if (!$('gameover').classList.contains('hidden')) {
      if (performance.now() - gameOverAt > 1200) startGame();
      return true;
    }
    return false;
  };
  const input = new Input(window, sim, { onAnyTap, isBlocked: () => paused || overlayOpen() });
  // some iOS versions only unlock Web Audio on touchend / click
  window.addEventListener('touchend', () => audio.unlock(), { passive: true });
  window.addEventListener('click', () => audio.unlock());

  // ------------------------------------------------------------------ audio reactions (presentation only)
  let lastThud = 0, lastSplash = 0;
  bus.on('flipper', ({ pressed }) => audio.flipper(pressed));
  bus.on('contact', (c) => {
    const now = performance.now();
    if (c.kind === 'sling') audio.sling();
    else if (c.kind === 'gate' || c.kind === 'post') audio.metalClick();
    else if (c.kind === 'ball') audio.metalClick();
    else if ((c.kind === 'wall' || c.kind === 'flipper') && c.impact > 7 && now - lastThud > 45) { lastThud = now; audio.thud(c.impact); }
  });
  bus.on('element', ({ id }) => {
    if (id.startsWith('mush')) { audio.bumperThump(); audio.mushroomBell(); }
    else if (id.startsWith('crystal')) audio.crystal();
    else if (id === 'potion') audio.potion();
  });
  bus.on('wizardHit', () => audio.wizardSpell());
  bus.on('doorOpen', () => audio.towerOpen());
  bus.on('doorThud', () => audio.doorThud());
  bus.on('towerEnter', () => audio.towerEnter());
  bus.on('superJackpot', () => audio.superJackpot());
  bus.on('skillShot', () => audio.skillShot());
  bus.on('railEnter', () => audio.metalClick());
  bus.on('ramp', () => { audio.metalClick(); audio.rampDone(); });
  bus.on('loop', () => audio.rampDone());
  bus.on('kickbackFire', () => audio.kickback());
  bus.on('launch', ({ power }) => audio.launch(power));
  bus.on('plungerPull', () => audio.plungerPull());
  bus.on('poolSplash', () => { const now = performance.now(); if (now - lastSplash > 150) { lastSplash = now; audio.splash(); } });
  bus.on('drain', () => audio.drain());
  bus.on('ballLost', () => audio.ballLost());
  bus.on('ballDissolve', () => audio.bell(1568, 0.08));
  bus.on('stage', ({ initial }) => { if (!initial) audio.chapter(); refreshMusic(); });
  bus.on('rushStart', () => { audio.rushStart(); refreshMusic(); });
  bus.on('rushEnd', refreshMusic);
  bus.on('multiballStart', refreshMusic);
  bus.on('multiballEnd', refreshMusic);
  bus.on('gameOver', ({ score, high, newHigh }) => {
    audio.gameOver();
    store.set('high', high);
    $('go-score').textContent = score.toLocaleString('en-US');
    $('go-best').textContent = high.toLocaleString('en-US');
    show('go-new', newHigh);
    gameOverAt = performance.now();
    setTimeout(() => { show('gameover', true); updateBest(); refreshMusic(); }, 900);
  });

  // ------------------------------------------------------------------ buttons & settings
  const tapBtn = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); fn(); });
  tapBtn('btn-pause', () => setPaused(!paused));
  tapBtn('btn-resume', () => setPaused(false));
  tapBtn('btn-restart', () => { setPaused(false); startGame(); });
  const openSettings = () => { input.releaseAll(); show('settings', true); };
  tapBtn('btn-settings', openSettings);
  tapBtn('btn-pause-settings', openSettings);
  tapBtn('btn-settings-close', () => { show('settings', false); store.set('settings', settings); });

  const seg = (id, key, apply) => {
    const el = $(id);
    const sync = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings[key]));
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); settings[key] = b.dataset.v; sync(); apply(); }));
    sync();
  };
  seg('set-camera', 'camera', () => renderer.setCameraMode(settings.camera));
  const applyQuality = () => {
    renderer.maxPixelRatio = settings.quality === 'saver' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.pixelRatio = Math.min(renderer.pixelRatio, renderer.maxPixelRatio);
    if (settings.quality === 'saver') renderer.pixelRatio = 1;
    renderer.renderer.setPixelRatio(renderer.pixelRatio);
    renderer.resize();
  };
  seg('set-quality', 'quality', applyQuality);
  $('set-music').value = settings.music;
  $('set-sfx').value = settings.sfx;
  $('set-music').addEventListener('input', (e) => { settings.music = +e.target.value; audio.musicVolume = settings.music / 100; audio.applyVolumes(); });
  $('set-sfx').addEventListener('input', (e) => { settings.sfx = +e.target.value; audio.sfxVolume = settings.sfx / 100; audio.applyVolumes(); });
  $('set-fps').checked = settings.fps;
  $('set-fps').addEventListener('change', (e) => { settings.fps = e.target.checked; hud.setFps(settings.fps); });
  hud.setFps(settings.fps);
  renderer.setCameraMode(settings.camera);
  applyQuality();

  window.addEventListener('keydown', (e) => { if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (sim.rules.state === 'playing') setPaused(true); else audio.suspend(); }
    else if (!paused) audio.resume();
  });
  const onResize = () => renderer.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 300));

  // ------------------------------------------------------------------ main loop (fixed-step simulation, interpolated rendering)
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // tab switch / hitch: never try to catch up seconds of physics
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 14) { sim.step(); acc -= STEP; n++; }
      if (n === 14) acc = 0;
    }
    renderer.render(paused ? 0 : dt, paused ? 1 : acc / STEP);
    hud.update(dt);
    // rolling sound from the real ball speeds
    let roll = 0, rail = false;
    for (const b of sim.world.balls) {
      if (!b.active || paused) continue;
      if (b.mode === 'free') roll += Math.hypot(b.vx, b.vy);
      else if (b.mode === 'rail') { roll += b.railV; rail = true; }
    }
    audio.setRolling(roll, rail);
  }
  requestAnimationFrame(frame);

  // debugging / automated QA hook
  window.__pinball = { sim, renderer, audio, hud, startGame, setPaused };
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;background:#200;padding:2em;font:16px sans-serif;z-index:99">Something went wrong starting the game.<br>${String(err && err.message || err)}</div>`);
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
