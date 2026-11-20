// Forest Pinball Saga – Step 3: the living painting (effects) on top of the physics.
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

async function boot() {
  if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('700 40px "Cinzel"'), new Promise((r) => setTimeout(r, 1200))]);
  const sim = new Simulation();
  const bus = sim.bus;
  const stage = await Stage.load(document.getElementById('stage'), window.__ART_BASE__ || 'art/');
  const layers = new TableLayers(stage, sim);
  await layers.load();
  const effects = new Effects(stage, sim, layers);
  effects.bind(bus);
  const hud = new HudLayer(document.getElementById('hud-layer'));
  if (window.__ART_URLS__) {
    hud.el('btn-pause').style.backgroundImage = `url(${window.__ART_URLS__['btn-pause.png']})`;
    hud.el('btn-camera').style.backgroundImage = `url(${window.__ART_URLS__['btn-camera.png']})`;
  }
  const audio = new AudioEngine();

  const layout = () => {
    const L = stage.resize();
    hud.fit(L);
    effects.setScale(L.s * stage.renderer.getPixelRatio());
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 300));

  // ------------------------------------------------------------------ flow
  let paused = false;
  const show = (id, on) => hud.el(id).classList.toggle('hidden', !on);
  const startGame = () => { audio.unlock(); show('tap-to-play', false); sim.rules.startGame(); audio.playMusic('ch1'); };
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
  hud.el('btn-pause').addEventListener('click', (e) => {
    e.stopPropagation();
    if (sim.rules.state !== 'playing') return;
    paused = !paused;
    if (paused) { input.releaseAll(); audio.suspend(); } else audio.resume();
    hud.set('hud-mode', paused ? 'PAUSED' : '');
  });
  hud.el('btn-camera').addEventListener('click', (e) => { e.stopPropagation(); hud.set('cam-num', hud.el('cam-num').textContent === '1' ? '2' : '1'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && sim.rules.state === 'playing' && !paused) hud.el('btn-pause').click(); });

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
  bus.on('gameOver', () => { audio.gameOver(); setTimeout(() => show('tap-to-play', true), 900); });

  // ------------------------------------------------------------------ loop: fixed 120 Hz physics, interpolated drawing
  let last = performance.now(), acc = 0;
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
    effects.update(paused ? 0 : dt);
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
  window.__saga = { sim, stage, layers, effects, hud, startGame, version: APP_VERSION };
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 0 40% 0;text-align:center;color:#fff;font:16px sans-serif">Could not start: ${String(e && e.message || e)}</p>`);
});
