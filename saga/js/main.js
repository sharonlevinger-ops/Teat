// Forest Pinball Saga – Step 5: the three story chapters on the living painted table.
// core/ (simulation, no DOM) --EventBus--> render/ audio/ ui/ (presentation)
import { Stage } from './render/stage.js';
import { TableLayers } from './render/layers.js';
import { HudLayer } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Simulation } from './core/sim.js';
import { STEP, PHYS, PHYS_DEFAULTS } from './core/config.js';
import { AudioEngine } from './audio/audio.js';
import { Effects } from './render/effects.js';
import { APP_VERSION } from './version.js';
import { Messages, GOAL_AT } from './ui/messages.js';
import { ChapterLook } from './render/chapters.js';
import { flatToArt, UI } from './core/artmap.js';
import { EventLog, buildReport, shareReport, initViewerDownloads } from './ui/report.js';
import { TuningPanel, loadSavedTune } from './ui/tuning.js';
import { Progress, GameStats } from './core/progress.js';
import { Summary } from './ui/summary.js';
import { Journal } from './ui/journal.js';

async function boot() {
  if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('700 40px "Cinzel"'), new Promise((r) => setTimeout(r, 1200))]);
  const sim = new Simulation();
  const bus = sim.bus;
  loadSavedTune(sim.world); // designer values saved on this device (if any)
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
  const tableLayer = document.getElementById('table-layer');
  tableLayer.style.width = '1284px'; tableLayer.style.height = '2281px';
  const messages = new Messages(hud, sim, tableLayer);
  messages.bind(bus);
  const audio = new AudioEngine();
  const eventLog = new EventLog(sim);
  initViewerDownloads();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('saga.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('saga.' + k, JSON.stringify(v)); } catch { /* private mode / storage blocked */ } },
  };
  sim.rules.highScore = store.get('high', 0);
  // long-term progress: daily missions, achievements, high-score table
  const progress = new Progress(store);
  progress.bind(bus);
  const journal = new Journal(progress);
  const stats = new GameStats(bus);
  const summary = new Summary(progress, stats);
  progress.onUnlock = (kind, item) => {
    if (kind === 'mission') messages.show(`MISSION COMPLETE<small>${item.text.toUpperCase()}</small>`);
    else if (kind === 'daily') messages.show(`ALL MISSIONS DONE!<small>STREAK: ${item.streak} ${item.streak === 1 ? 'DAY' : 'DAYS'}</small>`, true);
    else if (kind === 'achievement') messages.show(`ACHIEVEMENT<small>${item.name.toUpperCase()}</small>`);
    else if (kind === 'chapter') messages.show(`NEW SAGA RECORD<small>CHAPTER ${item.chapter} REACHED FOR THE FIRST TIME</small>`);
    if (audio.ready) audio.rampDone();
  };
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
  const startGame = () => { audio.unlock(); summary.hide(); show('tap-to-play', false); sim.rules.startGame(); refreshMusic(); };
  const onAnyTap = () => {
    audio.unlock();
    if (journal.open || summary.open) return true; // a card is on top: taps belong to it
    if (sim.rules.state !== 'playing') { startGame(); return true; } // the starting tap never flips or launches
    return false;
  };
  // launch area: the painted plunger and the TOUCH TO LAUNCH hint (bottom-right of the painting)
  // (screen space, from the un-zoomed fit, so it is the same corner in both camera views)
  const isPlungerZone = (x, y) => { const L = stage.layout; return x > L.left + 1030 * L.s && y > L.top + 1560 * L.s; };
  const tuning = new TuningPanel(sim.world);
  const input = new Input(window, sim, { onAnyTap, isBlocked: () => paused || tuning.open || journal.open || summary.open, isPlungerZone });
  window.addEventListener('touchend', () => audio.unlock(), { passive: true });
  window.addEventListener('click', () => audio.unlock());
  const pauseCard = document.getElementById('pause');
  // report a problem: frozen at the moment of pausing, so it shows exactly what the player saw
  let report = null;
  const captureReport = () => {
    let shot = null;
    try { stage.render(); shot = composeShot(); } catch { /* screenshot unavailable */ }
    const L = stage.layout;
    report = {
      shot,
      data: buildReport(sim, {
        version: APP_VERSION, view, events: eventLog.items.slice(),
        device: { ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`, safe: L.safe, pixelRatio: stage.renderer.getPixelRatio() },
      }),
    };
  };
  // the WebGL table plus the live HUD (score, values, mode, goal line, goal arrow), as the player saw it
  const composeShot = () => {
    const gl = stage.renderer.domElement, c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const g = c.getContext('2d');
    g.drawImage(gl, 0, 0);
    const L = stage.layout, k = gl.width / L.W; // CSS px -> canvas px
    const at = (x, y) => [(L.left + x * L.s) * k, (L.top + y * L.s) * k];
    const text = (str, x, y, px, color, align = 'center') => {
      if (!str) return;
      const [sx, sy] = at(x, y);
      g.font = `700 ${px * L.s * k}px Cinzel, Georgia, serif`;
      g.textAlign = align; g.textBaseline = 'middle';
      g.lineWidth = 3 * L.s * k; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(str, sx, sy);
      g.fillStyle = color; g.fillText(str, sx, sy);
    };
    const r = sim.rules;
    text('Forest Pinball Saga', UI.plaque.cx, UI.plaque.cy, 46, '#edc35c');
    text(r.score.toLocaleString('en-US'), UI.score.cx, 226, 104, '#f6cf5a');
    text(hud.el('hud-mode').textContent, UI.score.cx, 304, 27, '#c8f2ff');
    text(String(r.ball), UI.values.ball[0], UI.values.ball[1], 36, '#c6ecb0', 'left');
    text(r.stage.mult.toFixed(1) + 'X', UI.values.mult[0], UI.values.mult[1], 36, '#f6e2a8', 'left');
    text(String(r.guests), UI.values.guests[0], UI.values.guests[1], 36, '#9fb6ff', 'left');
    const goal = r.goal;
    if (goal) {
      text(goal.text, 565, UI.tapToPlay.cy - 26, 36, '#f3dda2');
      text(goal.sub, 565, UI.tapToPlay.cy + 16, 28, '#c8f2ff');
      const [ax, ay] = stage.artToScreen(...GOAL_AT[goal.target]), s = stage.tableXf.s * k; // arrow rides on the table
      g.save(); g.translate(ax * k, ay * k); g.scale(s, s);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-34, -44); g.lineTo(-14, -44); g.lineTo(-14, -92); g.lineTo(14, -92); g.lineTo(14, -44); g.lineTo(34, -44); g.closePath();
      g.fillStyle = '#ffe27a'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#3a2208'; g.stroke(); g.restore();
    }
    return c.toDataURL('image/jpeg', 0.82);
  };
  const btnReport = document.getElementById('btn-report');
  // reliability: tell the designer when saved tuning values (not the defaults) are in play
  const tuneNote = document.createElement('p');
  tuneNote.className = 'tune-note hidden';
  tuneNote.textContent = 'Custom tuning is active (hold "Paused" to change).';
  btnReport.before(tuneNote);
  const tuningActive = () => Object.keys(PHYS_DEFAULTS).some((k) => PHYS[k] !== PHYS_DEFAULTS[k]);
  btnReport.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!report) captureReport();
    shareReport(report.data, report.shot).then((res) => { btnReport.textContent = res === 'failed' ? 'Report unavailable here' : res === 'cancelled' ? 'Report a problem' : 'Report ready ✓'; });
  });
  let holdTimer = 0;
  const pauseTitle = pauseCard.querySelector('h2');
  const startHold = () => { clearTimeout(holdTimer); holdTimer = setTimeout(() => tuning.show(true), 1200); };
  const endHold = () => clearTimeout(holdTimer);
  for (const t of ['pointerdown']) pauseTitle.addEventListener(t, startHold);
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) pauseTitle.addEventListener(t, endHold);
  if (location.hash === '#tune') tuning.show(true);
  document.getElementById('btn-again').addEventListener('click', () => startGame());
  document.getElementById('btn-sum-journal').addEventListener('click', () => journal.show(true, 'scores'));
  document.getElementById('btn-sum-close').addEventListener('click', () => { summary.hide(); show('tap-to-play', true); });
  // Escape closes the top-most card (keyboard users)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (tuning.open) tuning.show(false);
    else if (journal.open) journal.show(false);
    else if (summary.open) { summary.hide(); show('tap-to-play', true); }
    else if (paused) setPaused(false);
  });
  const setPaused = (on) => {
    if (on && sim.rules.state !== 'playing') return;
    report = null; // taken when "Report a problem" is tapped: the game is frozen, so it is still this moment
    btnReport.textContent = 'Report a problem';
    tuneNote.classList.toggle('hidden', !on || !tuningActive());
    paused = on;
    pauseCard.classList.toggle('hidden', !on);
    if (on) { input.releaseAll(); audio.suspend(); document.getElementById('btn-resume').focus({ preventScroll: true }); } else audio.resume();
    messages.paused = on;
  };
  // between games the pause button opens the Journal (missions, achievements, scores)
  hud.el('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); if (sim.rules.state !== 'playing') journal.show(!journal.open); else setPaused(!paused); });
  document.getElementById('btn-journal').addEventListener('click', (e) => { e.stopPropagation(); journal.show(true); });
  document.getElementById('btn-resume').addEventListener('click', (e) => { e.stopPropagation(); setPaused(false); });
  document.getElementById('btn-newgame').addEventListener('click', (e) => { e.stopPropagation(); setPaused(false); startGame(); });
  // camera: 1 = the whole painted table, 2 = closer view that follows the ball (remembered)
  let view = store.get('view', 1) === 2 ? 2 : 1;
  const setView = (v) => { view = v; stage.setView(v); hud.set('cam-num', String(v)); store.set('view', v); };
  setView(view);
  hud.el('btn-camera').addEventListener('click', (e) => { e.stopPropagation(); setView(view === 1 ? 2 : 1); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && sim.rules.state === 'playing' && !paused) setPaused(true); });

  const toggle = document.getElementById('calib-toggle');
  const setCalib = (on) => { stage.setCalibration(on, sim.table); toggle.setAttribute('aria-pressed', String(on)); };
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setCalib(toggle.getAttribute('aria-pressed') !== 'true'); });
  if (location.hash === '#calib') { toggle.classList.remove('hidden'); setCalib(true); } // developer overlay only

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
  bus.on('gameOver', ({ high, score, newHigh }) => {
    audio.gameOver(); store.set('high', high); refreshMusic();
    const place = progress.recordScore(score, sim.rules.stage.id);
    journal.highlight = place;
    setTimeout(() => { if (sim.rules.state !== 'playing') summary.show({ score, high, newHigh, place }); }, 1800);
  });
  bus.on('nudge', () => audio.thud(26));
  bus.on('tiltWarning', () => audio.doorThud());
  bus.on('tilt', () => audio.ballLost());
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
  let last = performance.now(), acc = 0, jolted = false, tableKey = '', goodRuns = 0, skillWas = false;
  const frameTimes = [];
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
    layers.update(paused ? 1 : acc / STEP, paused ? 0 : dt);
    chapters.update(paused ? 0 : dt);
    effects.update(paused ? 0 : dt);
    // camera: follow the ball nearest the flippers (view 2), apply the table jolt
    let focus = null;
    for (const b of sim.world.balls) {
      if (!b.active || b.mode === 'tower' || b.mode === 'off') continue;
      if (!focus || b.y < focus.y) focus = b;
    }
    stage.setJolt(effects.shakeX, effects.shakeY);
    stage.updateCamera(dt, focus ? flatToArt(focus.x, focus.y) : [640, 1500]);
    const T = stage.tableXf, key = `${T.x.toFixed(1)},${T.y.toFixed(1)},${T.s.toFixed(4)}`;
    if (key !== tableKey) { tableKey = key; tableLayer.style.transform = `translate(${T.x}px, ${T.y}px) scale(${T.s})`; }
    if (view === 1 && (effects.shake > 0 || jolted)) { // in the full view the painted HUD frame jolts with the table
      jolted = effects.shake > 0;
      const L = stage.layout;
      hud.fit({ s: L.s, left: L.left + effects.shakeX * L.s, top: L.top + effects.shakeY * L.s });
    }
    // adaptive resolution: hold 60 FPS by lowering the pixel ratio if frames get slow
    frameTimes.push(dt);
    if (frameTimes.length >= 90) {
      const avg = frameTimes.reduce((a, c) => a + c, 0) / frameTimes.length;
      frameTimes.length = 0;
      const pr = stage.renderer.getPixelRatio(), maxPr = Math.min(window.devicePixelRatio || 1, 3);
      if (avg > 1 / 52 && pr > 1.5) { stage.setPixelRatio(pr - 0.5); layout(); goodRuns = 0; }
      else if (avg < 1 / 58 && pr < maxPr && ++goodRuns > 10) { stage.setPixelRatio(Math.min(maxPr, pr + 0.5)); layout(); goodRuns = 0; }
    }
    messages.update(dt);
    const r = sim.rules;
    const skillGlow = !paused && r.state === 'playing' && sim.canLaunch() && r.skillLit;
    if (skillGlow && !skillWas && audio.ready) audio.bell(1760, 0.05); // a soft chime marks the skill-shot window
    skillWas = skillGlow;
    hud.set('hud-score', r.score.toLocaleString('en-US'));
    hud.set('hud-ball', String(r.ball));
    hud.set('hud-mult', r.stage.mult.toFixed(1) + 'X');
    hud.set('hud-guests', String(r.guests));
    const waiting = r.state !== 'playing' || (sim.canLaunch() && !sim.plunger.pulling);
    const tl = hud.el('touch-launch');
    if (tl.classList.contains('hidden') === waiting) tl.classList.toggle('hidden', !waiting);
    let roll = 0, onRail = false; // wood rumble on the table, metallic hiss on the ramps
    for (const b of sim.world.balls) {
      if (!b.active || paused) continue;
      if (b.mode === 'free') roll += Math.hypot(b.vx, b.vy);
      else if (b.mode === 'rail') { roll += b.railV; onRail = true; }
    }
    audio.setRolling(roll, onRail);
    stage.render();
  }
  requestAnimationFrame(frame);
  window.__saga = { sim, stage, layers, effects, chapters, hud, messages, startGame, progress, journal, version: APP_VERSION };
}

boot().catch((e) => {
  console.error(e);
  const p = document.createElement('p');
  p.style.cssText = 'position:fixed;inset:auto 0 40% 0;text-align:center;color:#fff;font:16px sans-serif';
  p.textContent = `Could not start: ${String((e && e.message) || e)}`;
  document.body.appendChild(p);
});

// offline + home-screen install (not in the single-file build, where service workers are unavailable)
if ('serviceWorker' in navigator && !window.__ART_URLS__ && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
