// Forest Pinball Saga – Step 5: the three story chapters on the living painted table.
// core/ (simulation, no DOM) --EventBus--> render/ audio/ ui/ (presentation)
import { Stage } from './render/stage.js';
import { TableLayers } from './render/layers.js';
import { HudLayer } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Simulation } from './core/sim.js';
import { STEP } from './core/config.js';
import { AudioEngine } from './audio/audio.js';
import { Effects } from './render/effects.js';
import { APP_VERSION } from './version.js';
import { Messages } from './ui/messages.js';
import { ChapterLook } from './render/chapters.js';

async function boot() {
  if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('700 40px "Cinzel"'), new Promise((r) => setTimeout(r, 1200))]);
  const sim = new Simulation();
  const bus = sim.bus;
  const stage = await Stage.load(document.getElementById('stage'), window.__ART_BASE__ || 'art/');
  const layers = new TableLayers(stage, sim);
  await layers.load();
  const effects = new Effects(stage, sim, layers);
  effects.bind(bus);
  const chapters = new ChapterLook(stage, effects);
  chapters.bind(bus);
  const hud = new HudLayer(document.getElementById('hud-layer'));
  if (window.__ART_URLS__) {
    hud.el('btn-pause').style.backgroundImage = `url(${window.__ART_URLS__['btn-pause.png']})`;
    hud.el('btn-camera').style.backgroundImage = `url(${window.__ART_URLS__['btn-camera.png']})`;
  }
  const messages = new Messages(hud, sim);
  messages.bind(bus);
  const audio = new AudioEngine();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('saga.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('saga.' + k, JSON.stringify(v)); } catch { /* private mode / storage blocked */ } },
  };
  sim.rules.highScore = store.get('high', 0);
  // music follows the game: chapter track, multiball track, RUSH drum layer on top
  const refreshMusic = () => {
    if (!audio.ready) return;
    const r = sim.rules;
    audio.playMusic(r.state !== 'playing' ? 'ch1' : r.multiball ? 'multiball' : 'ch' + r.stage.id);
    audio.setRushLayer(r.state === 'playing' && r.rushActive);
  };

  const layout = () => {
    const L = stage.resize();
    hud.fit(L);
    effects.setScale(L.s * stage.renderer.getPixelRatio());
    chapters.setScale(L.s * stage.renderer.getPixelRatio());
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 300));

  // ------------------------------------------------------------------ flow
  let paused = false;
  const show = (id, on) => hud.el(id).classList.toggle('hidden', !on);
  const startGame = () => { audio.unlock(); show('tap-to-play', false); sim.rules.startGame(); refreshMusic(); };
  const onAnyTap = () => {
    audio.unlock();
    if (sim.rules.state !== 'playing') { startGame(); return true; } // the starting tap never flips or launches
    return false;
  };
  // launch area: the painted plunger and the TOUCH TO LAUNCH hint (bottom-right of the painting)
  const isPlungerZone = (x, y) => { const [ax, ay] = stage.screenToArt(x, y); return ax > 1030 && ay > 1560; };
  const input = new Input(window, sim, { onAnyTap, isBlocked: () => paused, isPlungerZone });
  window.addEventListener('touchend', () => audio.unlock(), { passive: true });
  window.addEventListener('click', () => audio.unlock());
  const pauseCard = document.getElementById('pause');
  const setPaused = (on) => {
    if (on && sim.rules.state !== 'playing') return;
    paused = on;
    pauseCard.classList.toggle('hidden', !on);
    if (on) { input.releaseAll(); audio.suspend(); } else audio.resume();
    messages.paused = on;
  };
  hud.el('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); setPaused(!paused); });
  document.getElementById('btn-resume').addEventListener('click', (e) => { e.stopPropagation(); setPaused(false); });
  document.getElementById('btn-newgame').addEventListener('click', (e) => { e.stopPropagation(); setPaused(false); startGame(); });
  hud.el('btn-camera').addEventListener('click', (e) => { e.stopPropagation(); hud.set('cam-num', hud.el('cam-num').textContent === '1' ? '2' : '1'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && sim.rules.state === 'playing' && !paused) setPaused(true); });

  const toggle = document.getElementById('calib-toggle');
  const setCalib = (on) => { stage.setCalibration(on, sim.table); toggle.setAttribute('aria-pressed', String(on)); };
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setCalib(toggle.getAttribute('aria-pressed') !== 'true'); });
  if (location.hash === '#calib') setCalib(true);

  // ------------------------------------------------------------------ sound (presentation only)
  let lastThud = 0;
  bus.on('flipper', ({ pressed }) => audio.flipper(pressed));
  bus.on('contact', (c) => {
    const now = performance.now();
    if (c.kind === 'sling') audio.sling();
    else if (c.kind === 'gate' || c.kind === 'post') audio.metalClick();
    else if ((c.kind === 'wall' || c.kind === 'flipper') && c.impact > 7 && now - lastThud > 45) { lastThud = now; audio.thud(c.impact); }
  });
  bus.on('element', ({ id }) => {
    if (id.startsWith('mush')) { audio.bumperThump(); audio.mushroomBell(); } else if (id.startsWith('crystal')) audio.crystal(); else if (id === 'potion') audio.potion();
  });
  bus.on('wizardHit', () => audio.wizardSpell());
  bus.on('launch', ({ power }) => audio.launch(power));
  bus.on('plungerPull', () => audio.plungerPull());
  bus.on('railEnter', () => audio.metalClick());
  bus.on('ramp', () => audio.rampDone());
  bus.on('kickbackFire', () => audio.kickback());
  bus.on('skillShot', () => audio.skillShot());
  bus.on('drain', () => audio.drain());
  bus.on('ballLost', () => audio.ballLost());
  bus.on('gameOver', ({ high }) => { audio.gameOver(); store.set('high', high); refreshMusic(); setTimeout(() => show('tap-to-play', true), 1600); });
  bus.on('doorOpen', () => audio.towerOpen());
  bus.on('doorThud', () => audio.doorThud());
  bus.on('towerEnter', () => audio.towerEnter());
  bus.on('superJackpot', () => audio.superJackpot());
  bus.on('rushStart', () => { audio.rushStart(); refreshMusic(); });
  bus.on('stage', ({ initial }) => { if (!initial) audio.chapter(); refreshMusic(); });
  for (const ev of ['rushEnd', 'multiballStart', 'multiballEnd']) bus.on(ev, refreshMusic);
  bus.on('ballDissolve', () => audio.bell(1568, 0.08));
  bus.on('loop', () => audio.rampDone());

  // ------------------------------------------------------------------ loop: fixed 120 Hz physics, interpolated drawing
  let last = performance.now(), acc = 0, jolted = false;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 14) { sim.step(); acc -= STEP; n++; }
      if (n === 14) acc = 0;
    }
    layers.update(paused ? 1 : acc / STEP);
    chapters.update(paused ? 0 : dt);
    effects.update(paused ? 0 : dt);
    if (effects.shake > 0 || jolted) { // the painted table and its HUD frame move together
      jolted = effects.shake > 0;
      const L = stage.layout;
      stage.setJolt(effects.shakeX, effects.shakeY);
      hud.fit({ s: L.s, left: L.left + effects.shakeX * L.s, top: L.top + effects.shakeY * L.s });
    }
    messages.update(dt);
    const r = sim.rules;
    hud.set('hud-score', r.score.toLocaleString('en-US'));
    hud.set('hud-ball', String(r.ball));
    hud.set('hud-mult', r.stage.mult.toFixed(1) + 'X');
    hud.set('hud-guests', String(r.guests));
    const waiting = r.state !== 'playing' || (sim.canLaunch() && !sim.plunger.pulling);
    const tl = hud.el('touch-launch');
    if (tl.classList.contains('hidden') === waiting) tl.classList.toggle('hidden', !waiting);
    let roll = 0;
    for (const b of sim.world.balls) if (b.active && b.mode === 'free' && !paused) roll += Math.hypot(b.vx, b.vy);
    audio.setRolling(roll, false);
    stage.render();
  }
  requestAnimationFrame(frame);
  window.__saga = { sim, stage, layers, effects, chapters, hud, messages, startGame, version: APP_VERSION };
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 0 40% 0;text-align:center;color:#fff;font:16px sans-serif">Could not start: ${String(e && e.message || e)}</p>`);
});
