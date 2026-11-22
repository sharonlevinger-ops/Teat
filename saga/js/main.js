// Forest Pinball Saga – Step 5: the three story chapters on the living painted table.
// core/ (simulation, no DOM) --EventBus--> render/ audio/ ui/ (presentation)
import { Stage } from './render/stage.js';
import { TableLayers } from './render/layers.js';
import { HudLayer } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Simulation } from './core/sim.js';
import { STEP } from './core/config.js';
import { AudioEngine } from './audio/audio.js';
import { Voice } from './audio/voice.js';
import { bindSound, panF } from './ui/sound-hooks.js';
import { bindVoice } from './ui/voice-hooks.js';
import { bindHitStop } from './ui/hitstop.js';
import { Effects } from './render/effects.js';
import { APP_VERSION } from './version.js';
import { Messages } from './ui/messages.js';
import { ChapterLook } from './render/chapters.js';
import { flatToArt } from './core/artmap.js';
import { EventLog, shareReport, initViewerDownloads } from './ui/report.js';
import { captureProblemReport } from './ui/report-capture.js';
import { TuningPanel, loadSavedTune, tuneIsCustom } from './ui/tuning.js';
import { Progress, GameStats } from './core/progress.js';
import { Summary } from './ui/summary.js';
import { HelpCard } from './ui/help.js';
import { Journal } from './ui/journal.js';
import { TABLES } from './core/tables.js';
import { LOOK, setLook } from './tables/looks.js';

async function boot() {
  if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('700 40px "Cinzel"'), new Promise((r) => setTimeout(r, 1200))]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('saga.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('saga.' + k, JSON.stringify(v)); } catch { /* private mode / storage blocked */ } },
  };
  // which table: ?table=… in the address, else the last one played (saved), else the Enchanted Forest
  const asked = new URLSearchParams(location.search).get('table');
  const fixed = window.__DEFAULT_TABLE__; // a build made for one table always opens on it (e.g. the Forest Kingdom link)
  const tableId = TABLES[asked] ? asked : TABLES[fixed] ? fixed : TABLES[store.get('table', 'forest')] ? store.get('table', 'forest') : 'forest';
  store.set('table', tableId);
  setLook(tableId);
  const tkey = (k) => (tableId === 'forest' ? k : `${k}.${tableId}`); // separate saves per table (forest keeps its old keys)
  const sim = new Simulation(undefined, tableId);
  const bus = sim.bus;
  loadSavedTune(sim.world); // designer values saved on this device (if any)
  const stage = await Stage.load(document.getElementById('stage'), window.__ART_BASE__ || 'art/', LOOK.art);
  const layers = new TableLayers(stage, sim);
  await layers.load();
  const effects = new Effects(stage, sim, layers);
  effects.bind(bus);
  const chapters = new ChapterLook(stage, effects);
  chapters.bind(bus);
  const hud = new HudLayer(document.getElementById('hud-layer'), LOOK.title);
  if (window.__ART_URLS__) {
    hud.el('btn-pause').style.backgroundImage = `url(${window.__ART_URLS__['btn-pause.png']})`;
    hud.el('btn-camera').style.backgroundImage = `url(${window.__ART_URLS__['btn-camera.png']})`;
  }
  const tableLayer = document.getElementById('table-layer');
  tableLayer.style.width = '1284px'; tableLayer.style.height = '2281px';
  const messages = new Messages(hud, sim, tableLayer);
  messages.bind(bus);
  const audio = new AudioEngine();
  const voice = new Voice(true);
  const eventLog = new EventLog(sim);
  initViewerDownloads();
  sim.rules.highScore = store.get(tkey('high'), 0);
  voice.setEnabled(store.get('voice', true) !== false);
  // long-term progress: daily missions, achievements, high-score table
  const progress = new Progress(store, undefined, { key: tkey('progress'), table: tableId });
  progress.bind(bus);
  const journal = new Journal(progress);
  const stats = new GameStats(bus);
  const summary = new Summary(progress, stats);
  const help = new HelpCard();
  journal.onHelp = () => help.show(true);
  progress.onUnlock = (kind, item) => {
    if (kind === 'mission') messages.show(`MISSION COMPLETE<small>${item.text.toUpperCase()}</small>`);
    else if (kind === 'daily') messages.show(`ALL MISSIONS DONE!<small>STREAK: ${item.streak} ${item.streak === 1 ? 'DAY' : 'DAYS'}</small>`, true);
    else if (kind === 'achievement') messages.show(`ACHIEVEMENT<small>${item.name.toUpperCase()}</small>`);
    else if (kind === 'star') { audio.knocker(); messages.show(`★ STAR ${item.count} OF ${item.of}<small>${item.text.toUpperCase()}</small>`, true); }
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
  // players: 1–4 taking turns (chosen between games, remembered)
  let players = Math.max(1, Math.min(4, store.get('players', 1) | 0)) || 1;
  const btnPlayers = hud.el('btn-players');
  const showPlayers = () => { btnPlayers.textContent = players === 1 ? '1 PLAYER' : `${players} PLAYERS`; };
  showPlayers();
  btnPlayers.addEventListener('click', (e) => { e.stopPropagation(); players = (players % 4) + 1; store.set('players', players); showPlayers(); });
  const btnTable = hud.el('btn-table');
  btnTable.textContent = `TABLE: ${TABLES[tableId].name.toUpperCase()}`;
  btnTable.addEventListener('click', (e) => {
    e.stopPropagation();
    const ids = Object.keys(TABLES), next = ids[(ids.indexOf(tableId) + 1) % ids.length];
    store.set('table', next);
    const u = new URL(location.href); u.searchParams.set('table', next); location.replace(u.toString()); // the game is rebuilt for that table
  });
  const startGame = () => { audio.unlock(); summary.hide(); show('tap-to-play', false); sim.rules.startGame(players); refreshMusic(); };
  const onAnyTap = () => {
    audio.unlock();
    voice.unlock();
    if (journal.open || summary.open || help.open) return true; // a card is on top: taps belong to it
    if (sim.rules.state !== 'playing') { startGame(); return true; } // the starting tap never flips or launches
    return false;
  };
  // launch area: the painted plunger and the TOUCH TO LAUNCH hint (bottom-right of the painting)
  // (screen space, from the un-zoomed fit, so it is the same corner in both camera views)
  const isPlungerZone = (x, y) => { const L = stage.layout; return x > L.left + 1030 * L.s && y > L.top + 1560 * L.s; };
  const tuning = new TuningPanel(sim.world);
  const input = new Input(window, sim, { onAnyTap, isBlocked: () => paused || tuning.open || journal.open || summary.open || help.open, isPlungerZone });
  window.addEventListener('touchend', () => { audio.unlock(); voice.unlock(); }, { passive: true });
  window.addEventListener('click', () => { audio.unlock(); voice.unlock(); });
  const pauseCard = document.getElementById('pause');
  // report a problem: taken when the button is tapped (the game is frozen while paused, so it is that moment)
  let report = null;
  const captureReport = () => { report = captureProblemReport({ stage, sim, hud, eventLog, view, version: APP_VERSION }); };
  const btnReport = document.getElementById('btn-report');
  // reliability: tell the designer when saved tuning values (not the defaults) are in play
  const tuneNote = document.createElement('p');
  tuneNote.className = 'tune-note hidden';
  tuneNote.textContent = 'Custom tuning is active (hold "Paused" to change).';
  btnReport.before(tuneNote);
  const tuningActive = () => tuneIsCustom();
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
    else if (help.open) help.show(false);
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
    if (on) { input.releaseAll(); audio.suspend(); voice.stop(); document.getElementById('btn-resume').focus({ preventScroll: true }); } else audio.resume();
    messages.paused = on;
  };
  // between games the pause button opens the Journal (missions, achievements, scores)
  hud.el('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); if (sim.rules.state !== 'playing') journal.show(!journal.open); else setPaused(!paused); });
  document.getElementById('btn-journal').addEventListener('click', (e) => { e.stopPropagation(); journal.show(true); });
  document.getElementById('btn-help').addEventListener('click', (e) => { e.stopPropagation(); help.show(true); });
  const btnVoice = document.getElementById('btn-voice');
  const showVoice = () => { btnVoice.textContent = voice.enabled ? 'Voice: On' : 'Voice: Off'; btnVoice.setAttribute('aria-pressed', String(voice.enabled)); };
  if (!voice.available) btnVoice.classList.add('hidden');
  showVoice();
  btnVoice.addEventListener('click', (e) => { e.stopPropagation(); voice.unlock(); voice.setEnabled(!voice.enabled); store.set('voice', voice.enabled); showVoice(); if (voice.enabled) voice.say('Welcome back', 3); });
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
  bindSound(bus, audio);
  bindVoice(bus, voice);
  const hitStop = bindHitStop(bus);
  bus.on('gameOver', ({ high, score, newHigh, scores, winner }) => {
    audio.gameOver(); store.set(tkey('high'), high); refreshMusic();
    // every player's game goes into the score table; the best one is highlighted
    const places = (scores && scores.length > 1 ? scores : [score]).map((sc) => progress.recordScore(sc, sim.rules.stage.id));
    const place = scores && scores.length > 1 ? progress.scores.findIndex((e) => e.score === score) + 1 : places[0];
    journal.highlight = place;
    setTimeout(() => { if (sim.rules.state !== 'playing') summary.show({ score, high, newHigh, place, scores, winner }); }, 1800);
  });

  bus.on('rushStart', () => { audio.rushStart(); refreshMusic(); });
  bus.on('stage', ({ initial }) => { if (!initial) audio.chapter(); refreshMusic(); });
  for (const ev of ['rushEnd', 'multiballStart', 'multiballEnd']) bus.on(ev, refreshMusic);

  // ------------------------------------------------------------------ loop: fixed 120 Hz physics, interpolated drawing
  let last = performance.now(), acc = 0, jolted = false, tableKey = '', goodRuns = 0, skillWas = false;
  const frameTimes = [];
  // FPS meter (for checking on the real phone): add #fps to the address, or the button in the tuning panel
  const fpsEl = document.createElement('div');
  fpsEl.className = 'fps-meter hidden';
  document.body.appendChild(fpsEl);
  const perf = { frames: 0, js: 0, worst: 0, t: performance.now() };
  window.__perf = perf;
  const setFps = (on) => fpsEl.classList.toggle('hidden', !on);
  if (location.hash === '#fps') setFps(true);
  window.addEventListener('saga-fps', () => setFps(fpsEl.classList.contains('hidden')));
  function frame(now) {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!paused && hitStop.active) { hitStop.tick(dt); acc = 0; } // freeze-frame: the table holds its breath
    else if (!paused) {
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
    hud.set('hud-mult', r.chapterMult.toFixed(1) + 'X');
    hud.set('hud-guests', String(r.guests));
    const waiting = r.state === 'playing' && sim.canLaunch() && !sim.plunger.pulling; // only while a ball waits (not over TAP FLIPPERS TO PLAY)
    const pb = r.state !== 'playing' && !summary.open; // the player-count button only between games
    if (btnPlayers.classList.contains('hidden') === pb) { btnPlayers.classList.toggle('hidden', !pb); btnTable.classList.toggle('hidden', !pb); }
    const tl = hud.el('touch-launch');
    if (tl.classList.contains('hidden') === waiting) tl.classList.toggle('hidden', !waiting);
    let roll = 0, onRail = false, panSum = 0; // wood rumble on the table, metallic hiss on the ramps
    for (const b of sim.world.balls) {
      if (!b.active || paused) continue;
      let v = 0;
      if (b.mode === 'free') v = Math.hypot(b.vx, b.vy);
      else if (b.mode === 'rail') { v = b.railV; onRail = true; }
      roll += v; panSum += v * panF(b.x);
    }
    audio.setRolling(roll, onRail, roll > 0 ? panSum / roll : 0);
    stage.render();
    // frame cost (JS + draw submission) and frame rate, averaged over half a second
    const js = performance.now() - t0;
    perf.frames++; perf.js += js; perf.worst = Math.max(perf.worst, dt);
    if (now - perf.t >= 500) {
      perf.fps = (perf.frames * 1000) / (now - perf.t); perf.avgJs = perf.js / perf.frames; perf.worstMs = perf.worst * 1000;
      if (!fpsEl.classList.contains('hidden')) fpsEl.textContent = `${perf.fps.toFixed(0)} FPS · JS ${perf.avgJs.toFixed(1)} ms · worst frame ${perf.worstMs.toFixed(0)} ms · DPR ${stage.renderer.getPixelRatio()}`;
      perf.frames = 0; perf.js = 0; perf.worst = 0; perf.t = now;
    }
  }
  requestAnimationFrame(frame);
  window.__saga = { sim, stage, layers, effects, chapters, hud, messages, startGame, progress, journal, table: tableId, version: APP_VERSION };
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
