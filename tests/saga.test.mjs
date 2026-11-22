// Forest Pinball Saga (painted table) – physics and flow QA on the table traced from the painting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, findDeadSpots, outsideOrEnclosed, insideCabinet } from './helpers/saga-sim.mjs';
import { HZ, PHYS, SCORE, TIMING } from '../saga/js/core/config.js';
import { botFlippers } from './helpers/pinball-bot.mjs';
import { flatToArt, artToFlat } from '../saga/js/core/artmap.js';

const secs = (s) => Math.round(s * HZ);
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(i); } };

function newGame() {
  const sim = new Simulation();
  const events = [];
  sim.bus.on('*', (type, p) => events.push({ type, p: p && typeof p === 'object' ? { ...p } : p }));
  sim.rules.startGame();
  return { sim, events, count: (t) => events.filter((e) => e.type === t).length };
}

test('perspective mapping: painting <-> flat table round-trips', () => {
  for (const [x, y] of [[0, 0], [21, 0], [10.5, 20], [3, 37], [18, 5]]) {
    const [ax, ay] = flatToArt(x, y);
    const [fx, fy] = artToFlat(ax, ay);
    assert.ok(Math.abs(fx - x) < 1e-6 && Math.abs(fy - y) < 1e-6);
  }
});

test('no tunnelling at max speed through the painted walls or a swinging flipper', () => {
  const sim = new Simulation();
  const w = sim.world, b = w.balls[0];
  w.gravity = 0;
  for (const a of [180, 160, 200, 140]) { // fire at the left wall
    sim._place(b, 6, 18, Math.cos((a * Math.PI) / 180) * PHYS.MAX_SPEED, Math.sin((a * Math.PI) / 180) * PHYS.MAX_SPEED, 'free');
    for (let i = 0; i < 120; i++) { w.step(1 / HZ); assert.ok(outsideOrEnclosed(b.x, b.y, sim) === false || b.x > 0, `escaped at ${b.x},${b.y}`); }
  }
  w.gravity = PHYS.GRAVITY;
  const f = w.flippers[0];
  sim._place(b, f.px + 2.2, 9, 0, -PHYS.MAX_SPEED, 'free');
  let flipped = false;
  for (let i = 0; i < 90; i++) {
    if (!flipped && b.y < f.py + 2.5) { w.setFlipper('L', true); flipped = true; }
    w.step(1 / HZ);
    const dx = f.tx - f.px, dy = f.ty - f.py;
    const t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / (dx * dx + dy * dy);
    if (t > 0.05 && t < 0.95) assert.ok((b.x - f.px) * -dy + (b.y - f.py) * dx > 0, `ball went through the flipper at step ${i}`);
  }
});

test('no dead spots anywhere on the painted table (flippers down); with flippers up only the cradles', () => {
  assert.deepEqual(findDeadSpots({ step: 0.5, enclosed: outsideOrEnclosed }), []);
  const up = findDeadSpots({ step: 1, flippersUp: true, enclosed: outsideOrEnclosed });
  const flips = new Simulation().world.flippers;
  for (const [, , x, y] of up) assert.ok(flips.some((f) => Math.hypot(x - f.px, y - f.py) < 1.4), `unexpected rest at ${x},${y}`);
});

test('launch: only from the plunger, never twice in a row; a full plunge reaches the top arc', () => {
  const { sim, count } = newGame();
  const b = sim.heldBall();
  assert.ok(b, 'ball waits on the plunger');
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch();
  assert.equal(sim.pressLaunch(), false);
  let maxY = 0, cameDown = false;
  run(sim, secs(6), () => { maxY = Math.max(maxY, b.y); if (b.x < 15 && b.y < 30 && maxY > 37) cameDown = true; });
  assert.ok(maxY > 37, `ball reached the top arc (max y ${maxY.toFixed(1)})`);
  assert.ok(cameDown, 'ball came round the top and into the playfield');
  assert.equal(count('launch'), 1);
});

test('weak plunge falls back onto the plunger and can be launched again (no skill shot)', () => {
  const { sim } = newGame();
  sim.rules.skillPhase = secs(TIMING.SKILL_LIT) + 5; // indicator dark: a plain weak launch
  sim.pressLaunch(); run(sim, 2); sim.releaseLaunch(); // 25% power
  run(sim, secs(6));
  assert.ok(sim.heldBall(), 'back on the plunger');
  assert.equal(sim.rules.skillAvailable, false);
});

test('skill shot on the painted table: released in the lit window, the ball is steered into mushroom 3', () => {
  const { sim, count, events } = newGame();
  run(sim, 100);
  sim.pressLaunch();
  while (!sim.rules.skillLit || sim.plunger.power < 0.6) sim.step();
  sim.releaseLaunch();
  run(sim, secs(8)); // physics runs at 75% speed: the ball needs longer to come round
  assert.equal(count('skillShot'), 1);
  assert.equal(events.find((e) => e.type === 'score' && e.p.reason === 'skillShot').p.points, SCORE.SKILL_SHOT);
});

test('slingshots kick: a ball touching the painted rubber is fired back hard (both sides)', () => {
  for (const id of ['slingL', 'slingR']) {
    const sim = new Simulation();
    const w = sim.world, b = w.balls[0];
    const seg = w.segs.find((s) => s.kind === 'sling' && s.id === id);
    const mx = (seg.ax + seg.bx) / 2, my = (seg.ay + seg.by) / 2;
    const toCentre = Math.sign(10.5 - mx);
    let n = [-seg.dy, seg.dx]; const l = Math.hypot(...n); n = [n[0] / l, n[1] / l];
    if (n[0] * toCentre < 0) n = [-n[0], -n[1]]; // the rubber's outward normal points to the table centre
    sim._place(b, mx + n[0] * 1.2, my + n[1] * 1.2, -n[0] * 4, -n[1] * 4, 'free'); // a gentle roll into the rubber
    let kicks = 0;
    sim.bus.on('contact', (c) => { if (c.kind === 'sling') kicks++; });
    for (let i = 0; i < 40 && !kicks; i++) w.step(1 / HZ);
    assert.ok(kicks > 0, `${id} was touched`);
    const v = Math.hypot(b.vx, b.vy), out = b.vx * n[0] + b.vy * n[1];
    assert.ok(v > PHYS.SLING_KICK * 0.7 && out > 0, `${id} kicked the ball away (speed ${v.toFixed(1)})`);
  }
});

test('slingshot kick scores 500 (x chapter multiplier), once per kick', () => {
  const { sim, events } = newGame();
  const r = sim.rules;
  r.onSlingHit('slingL', 3, 9);
  r.onSlingHit('slingL', 3, 9); // same contact repeating within the cooldown
  const awards = events.filter((e) => e.type === 'score' && e.p.reason === 'sling');
  assert.equal(awards.length, 1);
  assert.equal(awards[0].p.points, SCORE.SLING);
  assert.equal(SCORE.SLING, 500);
  r.score = 15000; r._checkStage(); run(sim, 30);
  r.onSlingHit('slingR', 17, 9);
  assert.equal(r.lastAward.points, 750, '500 x 1.5 in chapter 2');
});

test('right outlane has its own kickback (like the left); the potion relights both', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  const b = sim.heldBall(); b.mode = 'free';
  const [x, y] = sim.table.points.kickbackR;
  sim._place(b, x, y + 3, 0, -15, 'free');
  run(sim, secs(1));
  assert.equal(count('kickbackFire'), 1, 'right kickback fired');
  assert.ok(b.y > y, 'ball sent back up the right outlane');
  assert.equal(r.kickLit.R, false);
  assert.equal(r.kickLit.L, true, 'left kickback still lit');
  r.cooldowns.clear(); r.onElementHit('potion', 0, 0);
  assert.equal(r.kickLit.R, true);
});

test('both painted ramps ride end to end: crystal ramp passes the potion, both drop into an inlane', () => {
  for (const [id, entryArt] of [['rampA', [796, 680]], ['rampB', [482, 726]]]) {
    const { sim, count, events } = newGame();
    const b = sim.heldBall(); b.mode = 'free';
    const [x, y] = artToFlat(...entryArt);
    sim._place(b, x, y, 0, 18, 'free'); // a shot travelling up into the entrance
    let rode = false;
    run(sim, secs(6), () => { if (b.mode === 'rail') rode = true; });
    assert.ok(rode, `${id}: the ball rode the rail`);
    assert.equal(events.filter((e) => e.type === 'ramp' && e.p.id === id).length >= 1, true, `${id} completed`);
    if (id === 'rampA') assert.ok(events.some((e) => e.type === 'element' && e.p.id === 'potion'), 'crystal ramp counts the potion');
    void count;
  }
});

test('kickback saves the left outlane once', () => {
  const { sim, count } = newGame();
  const b = sim.heldBall(); b.mode = 'free';
  const [x, y] = sim.table.points.kickback;
  sim._place(b, x, y + 3, 0, -15, 'free');
  run(sim, secs(1));
  assert.equal(count('kickbackFire'), 1);
  assert.ok(b.y > y, 'ball sent back up');
});

test('soak: 15 minutes of bot play on the painted table – no escapes, every target reachable', () => {
  const sim = new Simulation();
  const seen = new Set();
  let rescues = 0, escapes = 0;
  sim.bus.on('element', (p) => seen.add(p.id));
  sim.bus.on('wizardHit', () => seen.add('wizard'));
  sim.bus.on('ramp', (p) => seen.add(p.id));
  sim.bus.on('ballRescue', () => rescues++);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hold = { L: 0, R: 0, cdL: 0, cdR: 0 };
  let pull = 0;
  sim.rules.startGame();
  for (let i = 0; i < secs(15 * 60); i++) {
    if (sim.rules.state !== 'playing') sim.rules.startGame();
    botFlippers(sim, hold, rnd, 0.65); // a human-like spread of flip timings
    if (sim.heldBall() && sim.canLaunch()) {
      if (!sim.plunger.pulling) { sim.pressLaunch(); pull = 20 + Math.floor(rnd() * 100); } else if (--pull <= 0) sim.releaseLaunch();
    }
    sim.step();
    for (const b of sim.world.balls) {
      if (!b.active) continue;
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
      if (b.mode === 'free' && !insideCabinet(b.x, b.y, sim)) escapes++;
    }
  }
  console.log(`  targets seen: ${[...seen].sort().join(', ')}; rescues: ${rescues}`);
  assert.equal(escapes, 0);
  for (const id of ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'wizard', 'rampA', 'rampB']) assert.ok(seen.has(id), `never hit: ${id}`);
  assert.ok(rescues < 15, `too many stuck-ball rescues: ${rescues}`);
});

test('timers are exact on the painted table too (tower door open exactly 10 s)', () => {
  const { sim } = newGame();
  const r = sim.rules;
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  const start = sim.tick;
  while (r.doorOpen) sim.step();
  assert.equal(TIMING.DOOR_OPEN, 10);
  assert.equal(sim.tick - start, secs(10));
});

test('Ball Save: a ball lost within 6 s of reaching the playfield comes back once; later it is lost', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch();
  run(sim, secs(1.5));
  assert.ok(r.ballSaveActive, 'Ball Save running after the ball left the shooter lane');
  const drainNow = () => { const b = sim.world.balls.find((x) => x.active && x.mode !== 'held'); sim._place(b, 10.5, -2, 0, -10, 'free'); sim.step(); };
  drainNow();
  assert.equal(count('ballSaved'), 1);
  assert.equal(count('ballLost'), 0);
  assert.equal(r.ball, 1, 'still ball 1');
  assert.ok(sim.heldBall(), 'ball back on the plunger');
  assert.equal(r.ballSaveActive, false);
  // second launch of the same ball: no new Ball Save
  run(sim, secs(1)); sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, secs(1.5));
  assert.equal(r.ballSaveActive, false, 'only one save per ball');
  drainNow(); run(sim, 2);
  assert.equal(count('ballLost'), 1);
  assert.equal(r.ball, 2);
});

test('Ball Save expires after exactly 6 s', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  r.onShooterExit();
  assert.equal(r.saveTicks, secs(TIMING.BALL_SAVE));
  run(sim, secs(TIMING.BALL_SAVE) - 1);
  assert.ok(r.ballSaveActive);
  run(sim, 1);
  assert.equal(r.ballSaveActive, false);
  assert.equal(count('ballSaveEnd'), 1);
});

test('next goal follows the game: wizard -> open tower -> super jackpot, with chapter distance', () => {
  const { sim } = newGame();
  const r = sim.rules;
  assert.deepEqual(r.goal, { text: 'SKILL SHOT · RELEASE ON THE GOLD FLASH', target: 'mush3', sub: 'MUSHROOM RING 0/3 · CHAPTER 2 IN 15,000' });
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, 5);
  assert.deepEqual(r.goal, { text: 'WIZARD · 3 MORE HITS OPEN THE TOWER', target: 'wizard', sub: 'MUSHROOM RING 0/3 · CHAPTER 2 IN 15,000' });
  r.onWizardHit(0, 0);
  assert.match(r.goal.text, /2 MORE HITS/);
  for (let i = 0; i < 2; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  assert.equal(r.goal.target, 'door');
  assert.match(r.goal.text, /LOCK BALL 1 · 20,000/);
  const b = sim.world.balls.find((x) => x.active);
  r.locks = 2; // both balls already locked: this entry starts the multiball
  r.onTowerEnter(b);
  assert.match(r.goal.text, /SUPER JACKPOT/);
  r.score = 50000; r._checkStage();
  assert.equal(r.goal.sub, 'DRAGON AWAKENS 0/5 · FINAL CHAPTER');
  r.state = 'gameover';
  assert.equal(r.goal, null);
});

test('problem report: plain JSON with version, balls, rules and the recent events', async () => {
  const { EventLog, buildReport, summary } = await import('../saga/js/ui/report.js');
  const sim = new Simulation();
  const log = new EventLog(sim);
  sim.rules.startGame();
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, secs(2));
  const rep = JSON.parse(JSON.stringify(buildReport(sim, { version: '0.7.0', events: log.items.slice() })));
  assert.equal(rep.version, '0.7.0');
  assert.equal(rep.balls.length, 1);
  assert.ok(Number.isFinite(rep.balls[0].x) && Number.isFinite(rep.balls[0].speed));
  assert.equal(rep.rules.ball, 1);
  assert.ok(rep.events.some((e) => e.type === 'launch'));
  assert.ok(!rep.events.some((e) => e.type === 'contact'));
  assert.match(summary(rep), /0\.7\.0/);
});

test('deterministic: the same inputs give the same game, multiball tower ejects included', () => {
  const play = () => {
    const { sim } = newGame();
    sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, secs(2));
    const r = sim.rules;
    for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
    const b = sim.world.balls.find((x) => x.active); r.onTowerEnter(b);
    run(sim, secs(4));
    return sim.world.balls.filter((x) => x.active).map((x) => [x.x.toFixed(6), x.y.toFixed(6)]).join('|');
  };
  assert.equal(play(), play());
});

test('tuning panel values: applied live within range, out-of-range ignored, defaults restorable', async () => {
  const { applyTune, currentTune } = await import('../saga/js/ui/tuning.js');
  const { PHYS_DEFAULTS } = await import('../saga/js/core/config.js');
  const sim = new Simulation();
  applyTune({ GRAVITY: 60, SLING_KICK: 999, TIME_SCALE: 0.9 }, sim.world);
  assert.equal(PHYS.GRAVITY, 60);
  assert.equal(sim.world.gravity, 60);
  assert.equal(PHYS.SLING_KICK, PHYS_DEFAULTS.SLING_KICK, 'out of range ignored');
  assert.equal(currentTune().TIME_SCALE, 0.9);
  applyTune(PHYS_DEFAULTS, sim.world);
  assert.equal(PHYS.GRAVITY, PHYS_DEFAULTS.GRAVITY);
  assert.equal(PHYS.TIME_SCALE, PHYS_DEFAULTS.TIME_SCALE);
});

test('nudge pushes the free ball; too many nudges warn twice, then TILT kills the flippers until the next ball', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, secs(2));
  const b = sim.world.balls.find((x) => x.active && x.mode === 'free');
  const vy = b.vy;
  assert.ok(sim.nudge(1));
  assert.ok(b.vy > vy && b.vx !== 0, 'ball pushed');
  assert.equal(sim.nudge(1), false, 'cooldown between nudges');
  const spam = () => { for (let i = 0; i < 3; i++) { run(sim, secs(0.3)); sim.nudge(0); } };
  spam(); assert.equal(count('tiltWarning'), 1);
  spam(); assert.equal(count('tiltWarning'), 2);
  assert.equal(r.tilted, false);
  spam(); assert.equal(count('tilt'), 1);
  assert.ok(r.tilted);
  sim.setFlipper('L', true);
  assert.equal(sim.world.flippers.find((f) => f.side === 'L').pressed, false, 'flippers dead');
  const score = r.score; r.award(1000, 'test'); assert.equal(r.score, score, 'no scoring while tilted');
  // the ball drains -> next ball, tilt cleared
  const live = sim.world.balls.find((x) => x.active && x.mode !== 'held');
  r.saveTicks = 0; sim._place(live, 10.5, -2, 0, -10, 'free'); run(sim, secs(2));
  assert.equal(r.ball, 2);
  assert.equal(r.tilted, false);
  sim.setFlipper('L', true);
  assert.equal(sim.world.flippers.find((f) => f.side === 'L').pressed, true);
});

test('a calm nudge now and then never tilts', () => {
  const { sim, count } = newGame();
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch();
  for (let i = 0; i < 12; i++) { run(sim, secs(2.2)); sim.nudge(0); }
  assert.equal(count('tiltWarning'), 0);
});

test('daily missions: 3 per day, same for a given date, counted from game events, streak across days', async () => {
  const { Progress, dailyMissions, MISSION_POOL } = await import('../saga/js/core/progress.js');
  const { EventBus } = await import('../saga/js/core/events.js');
  assert.deepEqual(dailyMissions('2026-11-21'), dailyMissions('2026-11-21'));
  assert.equal(new Set(dailyMissions('2026-11-21')).size, 3);
  const days = new Set(); for (let d = 1; d <= 28; d++) days.add(dailyMissions(`2026-02-${String(d).padStart(2, '0')}`).join());
  assert.ok(days.size > 20, 'missions change from day to day');
  const mem = {}; const storage = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  let today = '2026-11-21';
  const p = new Progress(storage, () => today);
  const bus = new EventBus(); p.bind(bus);
  const unlocked = []; p.onUnlock = (kind, item) => unlocked.push(kind + ':' + (item.id || item.streak));
  const fire = (m) => { const def = MISSION_POOL.find((x) => x.id === m.id); const payload = { wizardHit: {}, doorOpen: {}, ramp: { id: m.id === 'rampA3' ? 'rampA' : 'rampB' }, rushStart: {}, multiballStart: {}, skillShot: {}, loop: {}, element: { id: 'mush1' }, stage: { index: 1 }, comboChain: { level: 5 }, score: { total: 60000 }, scoopCapture: {}, poolJackpot: {}, lanesComplete: {}, bonusX: { x: 3 }, crystalJackpot: {}, doubleOrbit: {}, frenzyStart: {}, chapterMission: {}, extraBall: {} }[def.ev]; for (let i = 0; i < def.n; i++) bus.emit(def.ev, payload); };
  for (const m of p.missions) fire(m);
  assert.ok(p.missions.every((m) => m.done));
  assert.equal(p.streak, 1);
  assert.ok(unlocked.includes('daily:1'));
  assert.ok(p.hasAchievement('daily'));
  // saved and reloaded
  assert.equal(new Progress(storage, () => today).streak, 1);
  today = '2026-11-22';
  const p2 = new Progress(storage, () => today); p2.bind(bus);
  assert.ok(p2.missions.every((m) => !m.done), 'new day, new missions');
  for (const m of p2.missions) fire(m);
  assert.equal(p2.streak, 2);
  today = '2026-11-25'; // skipped days: streak resets
  const p3 = new Progress(storage, () => today);
  assert.equal(p3.streak, 0);
});

test('achievements unlock once; score table keeps the best 10 in order', async () => {
  const { Progress } = await import('../saga/js/core/progress.js');
  const mem = {}; const storage = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  const p = new Progress(storage, () => '2026-11-21');
  const got = []; p.onUnlock = (k, item) => { if (k === 'achievement') got.push(item.id); };
  p.onEvent('stage', { index: 0, initial: true });
  assert.equal(p.hasAchievement('ch2'), false, 'the opening chapter does not count');
  p.onEvent('stage', { index: 2 }); p.onEvent('stage', { index: 2 });
  assert.deepEqual(got.filter((x) => x.startsWith('ch')), ['ch2', 'ch3']);
  p.onEvent('skillShot', {}); p.onEvent('skillShot', {});
  assert.equal(got.filter((x) => x === 'skill').length, 1);
  for (const s of [5000, 12000, 800, 40000, 22000, 9000, 15000, 3000, 70000, 1000, 2000, 30000]) p.recordScore(s, 1);
  assert.equal(p.scores.length, 10);
  assert.equal(p.scores[0].score, 70000);
  assert.ok(p.scores.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
  assert.equal(p.recordScore(50000, 3), 2);
  assert.equal(p.recordScore(10, 1), 0, 'too low for the table');
});

test('progress survives corrupt or tampered storage (no crash, no HTML from storage)', async () => {
  const { Progress } = await import('../saga/js/core/progress.js');
  const bad = { progress: { day: 5, missions: [{ id: 'gone', count: 'x' }], streak: 'lots', achievements: ['x'], scores: [{ score: '<img src=x onerror=alert(1)>', chapter: '<b>' }, { score: 1200, chapter: 9, day: '<script>' }, null, 7], bestChapter: 99, chapterVisits: 'no' } };
  const storage = { get: (k, d) => (k in bad ? bad[k] : d), set: () => {} };
  const p = new Progress(storage, () => '2026-11-21');
  assert.equal(p.missions.length, 3);
  assert.ok(p.missions.every((m) => typeof m.text === 'string' && m.count === 0));
  assert.deepEqual(p.scores, [{ score: 1200, chapter: 3, day: '' }]);
  assert.equal(p.streak, 0);
  assert.equal(p.bestChapter, 3);
  assert.deepEqual(p.chapterVisits, [0, 0, 0]);
});

test('saga map remembers the furthest chapter; game stats count one game', async () => {
  const { Progress, GameStats } = await import('../saga/js/core/progress.js');
  const { EventBus } = await import('../saga/js/core/events.js');
  const mem = {}; const storage = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  const bus = new EventBus();
  const p = new Progress(storage, () => '2026-11-21'); p.bind(bus);
  const st = new GameStats(bus);
  const seen = []; p.onUnlock = (k, i) => { if (k === 'chapter') seen.push(i.chapter); };
  bus.emit('gameStart', {}); bus.emit('stage', { index: 0, initial: true });
  bus.emit('wizardHit', {}); bus.emit('ramp', { id: 'rampA' }); bus.emit('loop', {}); bus.emit('comboChain', { level: 3 }); bus.emit('comboChain', { level: 2 });
  bus.emit('stage', { index: 1 });
  assert.equal(p.bestChapter, 2);
  assert.deepEqual(seen, [2]);
  assert.deepEqual({ w: st.wizard, r: st.ramps, c: st.bestCombo, ch: st.chapter }, { w: 1, r: 2, c: 3, ch: 2 });
  bus.emit('gameStart', {});
  assert.equal(st.wizard, 0, 'stats reset each game');
  bus.emit('stage', { index: 1 });
  assert.deepEqual(seen, [2], 'the record is announced only once');
  assert.deepEqual(new Progress(storage, () => '2026-11-21').chapterVisits, [2, 2, 0]);
});

test('no nudge (and so no tilt) while the ball waits on the plunger', () => {
  const { sim, count } = newGame();
  for (let i = 0; i < 10; i++) { run(sim, secs(0.3)); assert.equal(sim.nudge(0), false); }
  assert.equal(count('nudge'), 0);
  assert.equal(sim.rules.tilted, false);
});

// ------------------------------------------------------------------ table features (ideas 1–11)
const hitEl = (r, id, n = 1) => { for (let i = 0; i < n; i++) { r.cooldowns.clear(); r.onElementHit(id, 0, 0); } };
const freeBall = (sim) => { sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, secs(2)); return sim.world.balls.find((b) => b.active && b.mode === 'free'); };
const loseBall = (sim) => { const r = sim.rules; r.saveTicks = 0; for (const b of sim.world.balls) if (b.active && b.mode !== 'held') sim._place(b, 10.5, -2, 0, -10, 'free'); run(sim, 2); };

test('1 Mystery Scoop: a slow ball is caught, held, kicked out safely; a fast one skims over', async () => {
  const { SCOOP } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const b = freeBall(sim);
  const [x, y] = sim.table.points.scoop;
  sim._place(b, x, y + 1.5, 0, -8, 'free');
  run(sim, 20);
  assert.equal(count('scoopCapture'), 1);
  assert.equal(b.mode, 'scoop');
  run(sim, secs(SCOOP.HOLD) + 2);
  assert.equal(b.mode, 'free');
  assert.equal(count('scoopEject'), 1);
  assert.ok(b.vy < 0 && b.vx > 0, 'kicked out down-right');
  run(sim, 30);
  assert.equal(count('scoopCapture'), 1, 'not caught again straight away');
  // fast ball
  sim._place(b, x, y + 2, 0, -70, 'free');
  run(sim, 10);
  assert.equal(count('scoopCapture'), 1, 'too fast: skims over');
});

test('1 Mystery awards: weighted, seeded, and awards that make no sense become points', () => {
  const { sim, events } = newGame();
  const r = sim.rules;
  const seen = new Set();
  for (let i = 0; i < 300; i++) { r.onScoop(); seen.add(events.filter((e) => e.type === 'mystery').pop().p.award); r.boostTicks = 0; r.multiball = false; r.doorTicks = 0; r.wizardCharge = 0; r.extraLit = 0; }
  for (const a of ['points5k', 'points10k', 'points25k', 'ballSave', 'boost', 'wizard']) assert.ok(seen.has(a), `never awarded ${a}`);
  // kickbacks already lit -> points
  const { sim: s2, events: e2 } = newGame();
  s2.rand = () => 0.5; // lands on 'kickbacks' in the weight table
  s2.rules.onScoop();
  assert.equal(e2.filter((e) => e.type === 'mystery').pop().p.award, 'points5k');
});

test('2 Magic pool: 5 passes light the Pool Jackpot, the next pass collects it, value grows to a cap', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  const pass = () => { r.cooldowns.delete('pool'); r.onPool(); };
  for (let i = 0; i < 4; i++) pass();
  assert.equal(r.poolLit, false);
  pass();
  assert.equal(r.poolLit, true);
  const before = r.score; pass();
  assert.equal(count('poolJackpot'), 1);
  assert.ok(r.score - before >= MODES.POOL_JACKPOT);
  assert.equal(r.poolValue, MODES.POOL_JACKPOT + MODES.POOL_STEP);
  for (let k = 0; k < 30; k++) for (let i = 0; i < 6; i++) pass();
  assert.equal(r.poolValue, MODES.POOL_MAX, 'capped');
  r.cooldowns.delete('pool'); r.poolCharge = 0; r.poolLit = false;
  r.onPool(); r.onPool();
  assert.equal(r.poolCharge, 1, 'cooldown between passes');
});

test('3 M-A-G-E lanes: lanes light letters, flippers move them, completing raises the bonus multiplier (max 5)', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  const lane = (i) => { r.cooldowns.delete('lane' + i); r.onLane(i); };
  lane(1);
  assert.deepEqual(r.lanes, [false, true, false, false]);
  r.onFlipperPress('L'); assert.deepEqual(r.lanes, [true, false, false, false], 'left flipper moves letters left');
  r.onFlipperPress('R'); r.onFlipperPress('R'); assert.deepEqual(r.lanes, [false, false, true, false]);
  lane(0); lane(1); lane(3);
  assert.equal(r.bonusX, 2);
  assert.deepEqual(r.lanes, [false, false, false, false]);
  for (let k = 0; k < 6; k++) for (let i = 0; i < 4; i++) lane(i);
  assert.equal(r.bonusX, 5);
  assert.equal(count('bonusX'), 4, 'no event past the cap');
  // the real table: a ball down the left inlane lights A
  const { sim: s2 } = newGame();
  const b = freeBall(s2);
  const sensor = s2.table.sensors.find((q) => q.id === 'inlaneL');
  s2._place(b, sensor.x, sensor.y + 1.2, 0, -6, 'free'); run(s2, 20);
  assert.equal(s2.rules.lanes[1], true);
});

test('4 end-of-ball bonus: hits × bonus X is paid when the ball is lost (not when tilted), then resets', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, events } = newGame();
  const r = sim.rules;
  freeBall(sim);
  hitEl(r, 'mush1', 2); hitEl(r, 'crystal1'); r.onRamp('rampB');
  r.bonusX = 3;
  const base = 2 * MODES.BONUS.mush + MODES.BONUS.crystal + MODES.BONUS.ramp;
  assert.equal(r.bonusBase, base);
  loseBall(sim);
  const ev = events.find((e) => e.type === 'bonus');
  assert.ok(ev, 'bonus paid');
  assert.equal(ev.p.base, base); assert.equal(ev.p.x, 3);
  assert.equal(ev.p.points, Math.round(base * 3 * r.chapterMult));
  assert.equal(r.bonusBase, 0); assert.equal(r.bonusX, 1);
  assert.ok(r.serveTicks > secs(2.5), 'time to read the bonus');
  // tilted ball pays nothing
  run(sim, secs(4));
  freeBall(sim); hitEl(r, 'mush2', 3);
  r._tilt();
  loseBall(sim);
  assert.equal(events.filter((e) => e.type === 'bonus').length, 1);
});

test('5 Extra Ball: lit by a second RUSH (and by chapter 3, once), collected at the scoop, shoot again', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  freeBall(sim);
  r._startRush(); assert.equal(r.extraLit, 0);
  r.rushTicks = 0; r._startRush(); assert.equal(r.extraLit, 1);
  r.rushTicks = 0; r._startRush(); assert.equal(r.extraLit, 1, 'only once from RUSH');
  r.onScoop();
  assert.equal(r.extraLit, 0); assert.equal(r.extraBalls, 1); assert.equal(count('extraBall'), 1);
  r.rushTicks = 0;
  loseBall(sim);
  assert.equal(count('shootAgain'), 1);
  assert.equal(r.ball, 1, 'same ball number');
  r.score = r.stageMin(2); r._checkStage();
  assert.equal(r.extraLit, 1, 'chapter 3 lights one');
  r.stageIndex = 1; r._checkStage();
  assert.equal(r.extraLit, 1, 'only once');
});

test("6 Dragon's Fire: qualify, start at the scoop, burning targets pay once per wave, then the saga levels up", async () => {
  const { MODES, STAGES } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  freeBall(sim);
  r.flags.multiball = true; r._startRush(); r.rushTicks = 0;
  assert.equal(r.dragonReady, false);
  r.score = r.stageMin(2) - 1; r.award(1, 'x');
  assert.equal(r.stageIndex, 2); assert.equal(r.dragonReady, true);
  assert.equal(r.goal.target, 'scoop');
  r.extraLit = 0; r.onScoop();
  assert.ok(r.dragonActive); assert.equal(r.dragonLit.size, MODES.DRAGON_TARGETS.length);
  hitEl(r, 'mush1'); hitEl(r, 'mush1');
  assert.equal(count('dragonJackpot'), 1, 'a target pays once per wave');
  for (const id of ['mush2', 'mush3', 'crystal1', 'crystal2', 'potion']) hitEl(r, id);
  r.cooldowns.clear(); r.onWizardHit(0, 0); r.onRamp('rampA'); r.onRamp('rampB'); r.cooldowns.clear(); r.onDoorHit(0, 0);
  assert.equal(count('dragonWave'), 1);
  assert.equal(r.dragonLit.size, MODES.DRAGON_TARGETS.length, 'relit for the next wave');
  const sc = r.score;
  run(sim, r.dragonTicks);
  assert.equal(count('dragonEnd'), 1);
  assert.ok(r.score >= sc + MODES.DRAGON_COMPLETE, 'victory award');
  assert.equal(r.level, 2); assert.equal(r.stageIndex, 0); assert.equal(r.levelBase, r.score);
  assert.equal(r.chapterMult, STAGES[0].mult + MODES.LEVEL_STEP);
  assert.equal(r.stageMin(1), r.levelBase + Math.round(STAGES[1].min * 1.5));
  // losing the ball during the mode: it can be restarted at the scoop
  const { sim: s2 } = newGame(); const q = s2.rules;
  freeBall(s2); q.dragonReady = true; q.onScoop(); assert.ok(q.dragonActive);
  loseBall(s2);
  assert.equal(q.dragonActive, false); assert.equal(q.dragonReady, true); assert.equal(q.level, 1);
});

test('7 Hurry-up: the open tower is worth 20,000 falling to 5,000; entering pays it on top of the 15,000', async () => {
  const { MODES, TIMING } = await import('../saga/js/core/config.js');
  const { sim, events } = newGame();
  const r = sim.rules;
  const b = freeBall(sim);
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  assert.equal(r.hurryValue, MODES.HURRY_START);
  run(sim, secs(TIMING.DOOR_OPEN / 2));
  assert.ok(Math.abs(r.hurryValue - (MODES.HURRY_START + MODES.HURRY_END) / 2) <= 100);
  const v = r.hurryValue;
  r.locks = 2;
  r.onTowerEnter(b);
  assert.equal(events.find((e) => e.type === 'score' && e.p.reason === 'hurryUp').p.base, v);
  assert.equal(events.find((e) => e.type === 'score' && e.p.reason === 'towerEntry').p.base, 15000);
});

test('8 Spore Frenzy: 25 mushroom hits make mushrooms worth ×5 for exactly 20 s', async () => {
  const { MODES, SCORE } = await import('../saga/js/core/config.js');
  const { sim, events } = newGame();
  const r = sim.rules;
  freeBall(sim);
  const { TUNE } = await import('../saga/js/core/config.js');
  hitEl(r, 'mush1', TUNE.FRENZY_HITS - 1); assert.equal(r.frenzyActive, false);
  hitEl(r, 'mush2'); assert.equal(r.frenzyActive, true);
  hitEl(r, 'mush3');
  assert.equal(events.filter((e) => e.type === 'score' && e.p.reason === 'mush3').pop().p.base, SCORE.ELEMENT * MODES.FRENZY_MULT);
  hitEl(r, 'crystal1');
  assert.equal(events.filter((e) => e.type === 'score' && e.p.reason === 'crystal1').pop().p.base, SCORE.ELEMENT, 'only mushrooms');
  run(sim, secs(MODES.FRENZY_SECONDS) - 1); assert.ok(r.frenzyActive);
  run(sim, 1); assert.equal(r.frenzyActive, false);
});

test('9 Crystal Jackpot: alternate the crystals 4 times, then the crystal ramp collects it', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  freeBall(sim);
  hitEl(r, 'crystal1'); hitEl(r, 'crystal1'); hitEl(r, 'crystal2');
  assert.equal(r.crystalLit, false, 'same crystal twice restarts the sequence');
  hitEl(r, 'crystal1'); hitEl(r, 'crystal2');
  assert.equal(r.crystalLit, true);
  r.onRamp('rampB'); assert.equal(count('crystalJackpot'), 0, 'only the crystal ramp');
  r.onRamp('rampA'); assert.equal(count('crystalJackpot'), 1);
  assert.equal(r.crystalValue, MODES.CRYSTAL_JACKPOT + MODES.CRYSTAL_STEP);
});

test('10 Double Orbit: crystal + golden ramp back to back (either order, within 6 s)', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  freeBall(sim);
  r.onRamp('rampA'); run(sim, secs(2)); r.onRamp('rampB');
  assert.equal(count('doubleOrbit'), 1);
  const { TUNE } = await import('../saga/js/core/config.js');
  r.onRamp('rampB'); run(sim, secs(TUNE.DOUBLE_ORBIT_WINDOW) + 1); r.onRamp('rampA');
  assert.equal(count('doubleOrbit'), 1, 'too slow');
  run(sim, secs(1)); r.onRamp('rampB');
  assert.equal(count('doubleOrbit'), 2, 'either order');
});

test('11 chapter missions: one per chapter, distinct mushrooms / ramps / tower hits, paid once', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, events } = newGame();
  const r = sim.rules;
  freeBall(sim);
  hitEl(r, 'mush1', 3); assert.equal(r.mission.progress, 1, 'the same mushroom counts once');
  hitEl(r, 'mush2'); hitEl(r, 'mush3');
  assert.ok(r.mission.done);
  assert.equal(events.find((e) => e.type === 'score' && e.p.reason === 'chapterMission').p.base, MODES.MISSIONS[0].award);
  r.score = r.stageMin(1); r._checkStage();
  assert.equal(r.mission.id, 'moon');
  for (let i = 0; i < 4; i++) { r.onRamp(i % 2 ? 'rampA' : 'rampB'); r.cooldowns.clear(); r.lastRamp = null; }
  assert.equal(events.filter((e) => e.type === 'chapterMission').length, 2, 'moonlit ramps paid');
  if (r.stageIndex < 2) { r.score = r.stageMin(2); r._checkStage(); }
  assert.equal(r.mission.id, 'dragon');
  for (let i = 0; i < 5; i++) { r.cooldowns.clear(); r.onDoorHit(0, 0); }
  assert.ok(r.mission.done);
  assert.equal(events.filter((e) => e.type === 'chapterMission').length, 3);
});

test('no ball ever leaves the cabinet (3 seeds × 6 minutes of bot play with every feature live)', () => {
  for (const seed0 of [3, 29, 101]) {
    const sim = new Simulation();
    let seed = seed0; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hold = { L: 0, R: 0, cdL: 0, cdR: 0 }; let pull = 0, escapes = 0;
    sim.rules.startGame();
    for (let i = 0; i < secs(6 * 60); i++) {
      if (sim.rules.state !== 'playing') sim.rules.startGame();
      botFlippers(sim, hold, rnd, 0.6);
      if (sim.heldBall() && sim.canLaunch()) { if (!sim.plunger.pulling) { sim.pressLaunch(); pull = 20 + Math.floor(rnd() * 100); } else if (--pull <= 0) sim.releaseLaunch(); }
      sim.step();
      for (const b of sim.world.balls) if (b.active && b.mode === 'free' && !insideCabinet(b.x, b.y, sim)) escapes++;
    }
    assert.equal(escapes, 0, `seed ${seed0}`);
  }
});

test('every daily mission can be completed by a real game event', async () => {
  const { MISSION_POOL } = await import('../saga/js/core/progress.js');
  const { readFileSync } = await import('node:fs');
  const { readdirSync } = await import('node:fs');
  const files = ['../saga/js/core/rules.js', '../saga/js/core/sim.js', ...readdirSync(new URL('../saga/js/core/rules/', import.meta.url)).map((f) => `../saga/js/core/rules/${f}`)];
  const src = files.map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  for (const m of MISSION_POOL) assert.ok(new RegExp(`emit\\([^;]*'${m.ev}'`).test(src), `mission ${m.id} waits for '${m.ev}', which the game never emits`);
  assert.equal(new Set(MISSION_POOL.map((m) => m.id)).size, MISSION_POOL.length, 'unique ids');
});

test('tuning panel: feature values (scoop, frenzy, pool, crystals, double orbit) apply live and reset', async () => {
  const { applyTune, tuneIsCustom, resetTune } = await import('../saga/js/ui/tuning.js');
  const { TUNE, TUNE_DEFAULTS } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  freeBall(sim);
  assert.equal(tuneIsCustom(), false);
  applyTune({ POOL_PASSES: 3, FRENZY_HITS: 10, SCOOP_CATCH: 999 }, sim.world);
  assert.equal(TUNE.SCOOP_CATCH, TUNE_DEFAULTS.SCOOP_CATCH, 'out of range ignored');
  assert.ok(tuneIsCustom());
  for (let i = 0; i < 3; i++) { r.cooldowns.delete('pool'); r.onPool(); }
  assert.equal(r.poolLit, true, 'lit after 3 passes');
  hitEl(r, 'mush1', 10);
  assert.equal(count('frenzyStart'), 1, 'frenzy after 10');
  resetTune(sim.world);
  assert.equal(tuneIsCustom(), false);
  assert.deepEqual({ ...TUNE }, { ...TUNE_DEFAULTS });
});

test('8 ball lock: two entries lock balls (a new ball comes to the plunger), the third starts the multiball', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  const openAndEnter = () => {
    for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
    const b = sim.world.balls.find((x) => x.active && x.mode === 'free');
    b.mode = 'tower'; r.onTowerEnter(b);
  };
  freeBall(sim);
  openAndEnter();
  assert.equal(r.locks, 1); assert.equal(count('ballLock'), 1); assert.equal(r.multiball, false);
  assert.equal(sim.activeBallCount(), 0, 'the locked ball left the table');
  run(sim, secs(MODES.LOCK_RELAUNCH) + 1);
  assert.ok(sim.heldBall(), 'a new ball waits on the plunger');
  assert.equal(r.skillAvailable, false, 'no skill shot after a lock');
  assert.equal(r.ball, 1, 'still the same ball number');
  freeBall(sim); openAndEnter();
  assert.equal(r.locks, 2);
  run(sim, secs(MODES.LOCK_RELAUNCH) + 1); freeBall(sim);
  r.extraLit = 0; r.poolLit = false; r.crystalLit = false; r.dragonReady = false; // (the lock points may have lit other goals)
  assert.match(r.goal.text, /WIZARD/);
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  assert.match(r.goal.text, /MULTIBALL/);
  const b = sim.world.balls.find((x) => x.active && x.mode === 'free'); b.mode = 'tower'; r.onTowerEnter(b);
  assert.equal(r.multiball, true); assert.equal(count('towerEnter'), 1); assert.equal(r.locks, 0, 'locks reset for the next multiball');
  run(sim, secs(2));
  assert.ok(sim.activeBallCount() >= 3, 'several balls in play');
});

test('9 Add-a-Ball: the scoop adds one ball and 10 s during multiball (once per multiball)', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, count } = newGame();
  const r = sim.rules;
  const b = freeBall(sim);
  r.locks = 2; for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  b.mode = 'tower'; r.onTowerEnter(b);
  run(sim, secs(2));
  const balls = sim.activeBallCount(), t = r.mbTicks;
  if (balls < sim.maxBalls) {
    r.onScoop();
    assert.equal(count('addABall'), 1);
    assert.equal(sim.activeBallCount(), balls + 1);
    assert.equal(r.mbTicks, t + secs(MODES.ADD_A_BALL_TIME));
  } else {
    // table already full: the award falls back to the mystery
    r.onScoop(); assert.equal(count('addABall'), 0);
  }
  r.onScoop();
  assert.ok(count('addABall') <= 1, 'once per multiball');
});

test('10 Super Skill Shot: hold the left flipper while launching, then ride the golden ramp in time', async () => {
  const { MODES } = await import('../saga/js/core/config.js');
  const { sim, count, events } = newGame();
  const r = sim.rules;
  sim.setFlipper('L', true);
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch();
  sim.setFlipper('L', false);
  assert.equal(r.superArmed, true); assert.equal(r.skillArmed, false);
  assert.equal(r.goal.target, 'rampB');
  r.onRamp('rampA'); assert.equal(count('superSkillShot'), 0, 'only the golden ramp');
  r.onRamp('rampB'); assert.equal(count('superSkillShot'), 1);
  assert.equal(events.find((e) => e.type === 'score' && e.p.reason === 'superSkillShot').p.base, MODES.SUPER_SKILL);
  // too late
  const { sim: s2, count: c2 } = newGame();
  s2.setFlipper('L', true); s2.pressLaunch(); run(s2, secs(1)); s2.releaseLaunch(); s2.setFlipper('L', false);
  run(s2, secs(MODES.SUPER_SKILL_WINDOW) + 1);
  s2.rules.onRamp('rampB'); assert.equal(c2('superSkillShot'), 0);
});

test('11 Match: once per game, a drawn number vs the tens digit; a match gives one more ball', () => {
  // force a win and a loss with the seeded generator stubbed
  for (const won of [true, false]) {
    const { sim, count, events } = newGame();
    const r = sim.rules;
    r.ball = 3; r.score = 12340; // tens digit 4 -> 40
    sim.rand = () => (won ? 0.45 : 0.05);
    freeBall(sim);
    r.score = 12340; r.bonusBase = 0;
    loseBall(sim);
    const m = events.find((e) => e.type === 'match');
    assert.ok(m, 'match drawn');
    assert.equal(m.p.digit, 40);
    assert.equal(m.p.won, won);
    assert.equal(r.state, won ? 'playing' : 'gameover');
    if (won) { run(sim, secs(5)); freeBall(sim); loseBall(sim); assert.equal(r.state, 'gameover', 'only once'); assert.equal(count('match'), 1); }
  }
});

test('12 table stars: five milestones, each unlocked once, kept on the device, bad data ignored', async () => {
  const { Progress, STARS } = await import('../saga/js/core/progress.js');
  const mem = {}; const storage = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  const p = new Progress(storage, () => '2026-11-22');
  const got = []; p.onUnlock = (k, i) => { if (k === 'star') got.push(i.id + ':' + i.count); };
  p.onEvent('score', { total: 49999 }); assert.equal(p.starCount, 0);
  p.onEvent('score', { total: 50000 }); p.onEvent('score', { total: 60000 });
  p.onEvent('multiballStart', {}); p.onEvent('stage', { index: 2 }); p.onEvent('dragonStart', {});
  p.onEvent('dragonEnd', { completed: true, victory: false });
  assert.equal(p.hasStar('slayer'), false, 'the dragon must be defeated');
  p.onEvent('dragonEnd', { completed: true, victory: true });
  assert.deepEqual(got, ['score50k:1', 'multiball:2', 'chapter3:3', 'dragonFire:4', 'slayer:5']);
  assert.equal(new Progress(storage, () => '2026-11-22').starCount, STARS.length);
  const bad = { get: () => ({ stars: ['x'] }), set: () => {} };
  assert.equal(new Progress(bad, () => '2026-11-22').starCount, 0);
});

test('plunger pull-down gesture: power follows the finger, no auto-charge while dragging, launch uses it', () => {
  const { sim, events } = newGame();
  sim.rules.skillPhase = secs(TIMING.SKILL_LIT) + 5; // indicator dark: a plain launch
  assert.ok(sim.pressLaunch());
  sim.dragPull(0.4);
  run(sim, secs(1.5));
  assert.equal(sim.plunger.power, 0.4, 'no auto-charge while the finger holds it');
  sim.dragPull(1.7); assert.equal(sim.plunger.power, 1, 'clamped');
  sim.dragPull(0.6);
  sim.rules.skillPhase = secs(TIMING.SKILL_LIT) + 5; // release outside the skill-shot window (that one forces 0.85+)
  sim.releaseLaunch();
  assert.equal(events.filter((e) => e.type === 'launch').pop().p.power, 0.6);
  assert.equal(sim.plunger.drag, false);
});

test('full game, start to finish: every mode in one game with the real table, journal and summary attached', async () => {
  const { MODES, STAGES } = await import('../saga/js/core/config.js');
  const { Progress, GameStats } = await import('../saga/js/core/progress.js');
  const mem = {}; const storage = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  const sim = new Simulation();
  const events = []; sim.bus.on('*', (t) => events.push(t));
  const count = (t) => events.filter((e) => e === t).length;
  const progress = new Progress(storage, () => '2026-11-22'); progress.bind(sim.bus);
  const stats = new GameStats(sim.bus);
  const r = sim.rules;
  const live = () => sim.world.balls.find((b) => b.active && b.mode === 'free');
  const play = (s) => run(sim, secs(s));
  const launch = (opts = {}) => {
    while (!sim.heldBall() || !sim.canLaunch()) sim.step();
    if (opts.super) sim.setFlipper('L', true);
    sim.pressLaunch();
    if (opts.skill) { while (!r.skillLit || sim.plunger.power < 0.6) sim.step(); } else { run(sim, secs(0.9)); r.skillPhase = secs(TIMING.SKILL_LIT) + 3; }
    sim.releaseLaunch();
    if (opts.super) sim.setFlipper('L', false);
    play(2.5);
  };
  const hit = (id) => { r.cooldowns.clear(); r.onElementHit(id, 0, 0); };
  const openDoor = () => { for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); } };
  const enterTower = () => { const b = live() || sim.world.balls.find((x) => x.active); b.mode = 'tower'; r.onTowerEnter(b); };
  const drainAll = () => { r.saveTicks = 0; for (const b of sim.world.balls) if (b.active && b.mode !== 'held') sim._place(b, 10.5, -2, 0, -10, 'free'); run(sim, 3); };

  r.startGame();
  // ball 1: skill shot (real physics), the whole tower chain, multiball with add-a-ball and super jackpots
  launch({ skill: true });
  play(8);
  assert.equal(count('skillShot'), 1, 'skill shot');
  for (const k of [1, 2]) { openDoor(); enterTower(); assert.equal(r.locks, k); run(sim, secs(MODES.LOCK_RELAUNCH) + 2); launch(); }
  openDoor(); enterTower();
  assert.ok(r.multiball, 'multiball after two locks');
  play(2);
  r.onScoop(); // add-a-ball
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onDoorHit(0, 0); }
  assert.ok(count('superJackpot') >= 3);
  // RUSH x2 (extra ball lit), lanes, pool, crystals, double orbit, frenzy — all through the rules API while the balls fly
  for (const k of [0, 1]) { for (const id of ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion']) hit(id); r.rushTicks = 0; play(0.5); }
  assert.equal(r.rushCount, 2); assert.ok(r.extraLit >= 1, 'extra ball lit');
  for (let i = 0; i < 4; i++) { r.cooldowns.delete('lane' + i); r.onLane(i); }
  assert.equal(r.bonusX, 2);
  for (let i = 0; i < 6; i++) { r.cooldowns.delete('pool'); r.onPool(); }
  assert.equal(count('poolJackpot'), 1);
  for (const id of ['crystal1', 'crystal2', 'crystal1', 'crystal2']) hit(id);
  r.onRamp('rampA'); r.onRamp('rampB');
  assert.equal(count('crystalJackpot'), 1); assert.ok(count('doubleOrbit') >= 1);
  for (let i = 0; i < 25; i++) hit('mush1');
  assert.ok(count('frenzyStart') >= 1);
  play(3);
  // chapter 3 -> Dragon's Fire (needs multiball + RUSH + chapter 3 this saga)
  if (r.stageIndex < 2) { r.score = r.stageMin(2) - 1; r.award(1, 'push'); }
  assert.equal(r.stageIndex, 2); assert.ok(r.dragonReady, "Dragon's Fire ready");
  r.extraLit = Math.max(0, r.extraLit); const extraBefore = r.extraLit;
  r.onScoop(); // dragon takes priority over the lit extra ball
  assert.ok(r.dragonActive); assert.equal(r.extraLit, extraBefore);
  for (const id of ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion']) hit(id);
  r.cooldowns.clear(); r.onWizardHit(0, 0); r.onRamp('rampA'); r.onRamp('rampB'); r.cooldowns.clear(); r.onDoorHit(0, 0);
  assert.equal(count('dragonWave'), 1);
  run(sim, r.dragonTicks + 1);
  assert.equal(r.level, 2, 'saga level 2'); assert.equal(r.stageIndex, 0);
  // collect the extra ball, then lose balls: bonus, shoot again, match, game over
  r.onScoop();
  assert.ok(count('extraBall') >= 1);
  const ballsBefore = r.ball;
  sim.rand = () => 0.01; // the match will not hit (tens digit is drawn as 00 – make sure the score does not end in 0x)
  drainAll(); play(4);
  assert.ok(count('bonus') >= 1, 'end-of-ball bonus');
  assert.ok(count('shootAgain') >= 1 && r.ball === ballsBefore, 'shoot again keeps the ball number');
  let guard = 0;
  while (r.state === 'playing' && guard++ < 10) { if (sim.heldBall()) launch(); r.score += (Math.floor(r.score / 10) % 10 === 0) ? 10 : 0; drainAll(); play(4); }
  assert.equal(r.state, 'gameover');
  assert.equal(count('match'), 1, 'match drawn once');
  // the journal and the summary saw the same game
  assert.equal(progress.recordScore(r.score, r.stage.id), 1, 'first in the score table (as main.js records it at game over)');
  assert.equal(progress.starCount, 5, 'all five stars: 50k, multiball, chapter 3, dragon lit, dragon defeated');
  assert.ok(progress.hasAchievement('skill') && progress.hasAchievement('tower') && progress.hasAchievement('ch3'));
  assert.equal(progress.bestChapter, 3);
  assert.ok(stats.wizard >= 9 && stats.jackpots >= 3 && stats.skill === 1 && stats.chapter >= 1);
  // nothing ever left the cabinet or broke the numbers
  for (const b of sim.world.balls) if (b.active) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
  assert.ok(Number.isFinite(r.score) && r.score > 100000, `big score: ${r.score}`);
});

test('2–4 players: turns alternate ball by ball, each player keeps their own table, the best score wins', async () => {
  const { TUNE } = await import('../saga/js/core/config.js');
  const { sim, events } = newGame();
  const r = sim.rules;
  r.startGame(2);
  assert.equal(r.numPlayers, 2); assert.equal(r.player, 0);
  const lose = () => { r.saveTicks = 0; for (const b of sim.world.balls) if (b.active && b.mode !== 'held') sim._place(b, 10.5, -2, 0, -10, 'free'); run(sim, 2); run(sim, secs(4)); };
  // player 1, ball 1: a lock, some lanes, points
  freeBall(sim);
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  const b = sim.world.balls.find((x) => x.active && x.mode === 'free'); b.mode = 'tower'; r.onTowerEnter(b);
  run(sim, secs(2)); freeBall(sim);
  r.onLane(0); r.onLane(1);
  const p1Score = r.score;
  assert.equal(r.locks, Math.min(1, TUNE.LOCKS));
  lose();
  assert.equal(events.filter((e) => e.type === 'playerUp').pop().p.player, 2, 'player 2 up');
  assert.equal(r.player, 1); assert.equal(r.ball, 1); assert.equal(r.locks, 0, 'player 2 starts clean');
  assert.deepEqual(r.lanes, [false, false, false, false]);
  assert.ok(r.score < p1Score || r.score === 0);
  freeBall(sim); r.award(100000, 'test');
  lose();
  assert.equal(r.player, 0, 'back to player 1'); assert.equal(r.ball, 2);
  assert.equal(r.locks, Math.min(1, TUNE.LOCKS), 'player 1 keeps the lock');
  assert.ok(r.score >= p1Score, 'and the score');
  // play out every ball
  r.matchDone = true; r.players[1].matchDone = true; // (no match luck in this test)
  let guard = 0;
  while (r.state === 'playing' && guard++ < 20) { if (sim.heldBall()) freeBall(sim); lose(); }
  assert.equal(r.state, 'gameover');
  const over = events.filter((e) => e.type === 'gameOver').pop().p;
  assert.equal(over.scores.length, 2);
  assert.equal(over.winner, 2, 'player 2 had the big score');
  assert.equal(over.score, Math.max(...over.scores));
  assert.equal(events.filter((e) => e.type === 'playerUp').length, 5, 'P2 B1, P1 B2, P2 B2, P1 B3, P2 B3');
});

test('one player: no turns, unchanged flow', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  assert.equal(r.numPlayers, 1);
  freeBall(sim); r.saveTicks = 0; for (const b of sim.world.balls) if (b.active && b.mode !== 'held') sim._place(b, 10.5, -2, 0, -10, 'free'); run(sim, 2);
  assert.equal(count('playerUp'), 0); assert.equal(count('ballLost'), 1); assert.equal(r.ball, 2);
});

// ------------------------------------------------------------------ table 2: Forest Kingdom
const kingdomGame = () => { const sim = new Simulation(undefined, 'kingdom'); const events = []; sim.bus.on('*', (type, p) => events.push({ type, p: p && typeof p === 'object' ? { ...p } : p })); sim.rules.startGame(); return { sim, events, count: (t) => events.filter((e) => e.type === t).length }; };

test('Kingdom: the table is built from the shared cabinet, without the forest-only targets', () => {
  const sim = new Simulation(undefined, 'kingdom');
  const ids = new Set([...sim.table.circles, ...sim.table.walls, ...sim.table.sensors].map((x) => x.id).filter(Boolean));
  for (const id of ['mush1', 'mush2', 'mush3', 'wizard', 'castleGate', 'shield1', 'shield2', 'shield3', 'castleIn', 'mine', 'spinner', 'scoop', 'towerIn', 'rampA', 'rampB', 'slingL', 'slingR', 'inlaneL', 'outlaneR']) assert.ok(ids.has(id), `missing ${id}`);
  for (const id of ['crystal1', 'crystal2', 'potion']) assert.ok(!ids.has(id), `forest-only ${id} present`);
  assert.equal(sim.table.id, 'kingdom');
  assert.equal(new Simulation().table.id, 'forest');
});

test('Kingdom: no dead spots anywhere on the table', () => {
  assert.deepEqual(findDeadSpots({ step: 0.5, enclosed: outsideOrEnclosed, table: 'kingdom' }), []);
});

test('Kingdom: 10 minutes of bot play – nothing escapes, nothing sticks, every target is reached', () => {
  const sim = new Simulation(undefined, 'kingdom');
  const seen = new Set(); let escapes = 0, rescues = 0;
  sim.bus.on('element', (p) => seen.add(p.id)); sim.bus.on('castleGateHit', () => seen.add('castleGate'));
  sim.bus.on('wizardHit', () => seen.add('wizard')); sim.bus.on('ramp', (p) => seen.add(p.id));
  sim.bus.on('mineCapture', () => seen.add('mine')); sim.bus.on('scoopCapture', () => seen.add('scoop')); sim.bus.on('spin', () => seen.add('spinner'));
  sim.bus.on('ballRescue', () => rescues++);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hold = { L: 0, R: 0, cdL: 0, cdR: 0 }; let pull = 0;
  sim.rules.startGame();
  for (let i = 0; i < secs(10 * 60); i++) {
    if (sim.rules.state !== 'playing') sim.rules.startGame();
    botFlippers(sim, hold, rnd, 0.6);
    if (sim.heldBall() && sim.canLaunch()) { if (!sim.plunger.pulling) { sim.pressLaunch(); pull = 20 + Math.floor(rnd() * 100); } else if (--pull <= 0) sim.releaseLaunch(); }
    sim.step();
    for (const b of sim.world.balls) if (b.active && b.mode === 'free' && !insideCabinet(b.x, b.y, sim)) escapes++;
  }
  assert.equal(escapes, 0);
  assert.ok(rescues < 5, `stuck-ball rescues: ${rescues}`);
  for (const id of ['mush1', 'mush2', 'mush3', 'shield1', 'shield2', 'shield3', 'castleGate', 'wizard', 'rampA', 'rampB', 'mine', 'scoop', 'spinner']) assert.ok(seen.has(id), `never reached: ${id}`);
});

test('Kingdom: castle gate – 3 hits open it, shooting in rescues the princess (x2 scoring), the ball comes back out', async () => {
  const { KINGDOM_RULES: K } = await import('../saga/js/core/config.js');
  const { sim, count } = kingdomGame();
  const r = sim.rules;
  const b = freeBall(sim);
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onElementHit('castleGate', 0, 0); }
  assert.ok(r.gateOpen); assert.equal(count('gateOpen'), 1);
  assert.match(r.goal.text, /RESCUE THE PRINCESS/);
  b.mode = 'castle'; r.onCastleEnter(b);
  assert.equal(count('princessRescued'), 1); assert.ok(r.boostActive); assert.equal(r.gateOpen, false);
  assert.equal(r.rescueValue, K.RESCUE + K.RESCUE_STEP);
  run(sim, secs(K.CASTLE_HOLD) + 2);
  assert.equal(b.mode, 'free', 'kicked back out');
  assert.equal(count('castleEject'), 1);
  // the gate closes by itself after its time
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onElementHit('castleGate', 0, 0); }
  run(sim, secs(K.GATE_OPEN) + 1);
  assert.equal(r.gateOpen, false);
});

test("Kingdom: the prince's shields drop, all three start his quest, the castle gate collects it", async () => {
  const { KINGDOM_RULES: K } = await import('../saga/js/core/config.js');
  const { sim, events, count } = kingdomGame();
  const r = sim.rules;
  freeBall(sim);
  for (const id of ['shield1', 'shield2']) { r.cooldowns.clear(); r.onElementHit(id, 0, 0); }
  assert.deepEqual(r.shieldsDown, [true, true, false]);
  assert.equal(sim.world.isOn('shield1Up'), false, 'a dropped shield is gone from the table');
  r.cooldowns.clear(); r.onElementHit('shield1', 0, 0);
  assert.equal(count('shieldDown'), 2, 'a dropped shield cannot be hit again');
  r.cooldowns.clear(); r.onElementHit('shield3', 0, 0);
  assert.ok(r.questActive); assert.equal(r.questValue, K.QUEST_START);
  run(sim, secs(K.SHIELD_RESET) + 1);
  assert.deepEqual(r.shieldsDown, [false, false, false], 'bank reset');
  assert.equal(sim.world.isOn('shield2Up'), true);
  run(sim, secs(5));
  const v = r.questValue; assert.ok(v < K.QUEST_START && v > K.QUEST_END);
  r.cooldowns.clear(); r.onElementHit('castleGate', 0, 0);
  assert.equal(events.find((e) => e.type === 'score' && e.p.reason === 'princeQuest').p.base, v);
  assert.equal(r.questActive, false);
});

test("Kingdom: the dwarves' mine – each catch lights a dwarf, the seventh pays the gem jackpot; the spinner spins", async () => {
  const { KINGDOM_RULES: K } = await import('../saga/js/core/config.js');
  const { sim, count } = kingdomGame();
  const r = sim.rules;
  const b = freeBall(sim);
  const [mx, my] = sim.table.points.mine;
  sim._place(b, mx, my + 1.5, 0, -8, 'free'); run(sim, 20);
  assert.equal(count('mineCapture'), 1); assert.equal(r.dwarves, 1);
  run(sim, secs(2));
  assert.equal(b.mode, 'free', 'kicked out of the mine');
  for (let i = 0; i < K.DWARVES - 1; i++) r.onMine();
  assert.equal(count('gemJackpot'), 1); assert.equal(r.dwarves, 0); assert.equal(r.gemValue, K.GEMS + K.GEMS_STEP);
  r.onSpinner(48);
  assert.equal(count('spin'), 1);
  r.onSpinner(48);
  assert.equal(count('spin'), 1, 'one pass, one spin burst');
});

test('Kingdom: skill shot is steered at mushroom 1; RUSH uses the mushrooms and the shields', () => {
  const { sim, count } = kingdomGame();
  const r = sim.rules;
  assert.equal(r.skillTarget, 'mush1');
  run(sim, 100);
  sim.pressLaunch();
  while (!r.skillLit || sim.plunger.power < 0.6) sim.step();
  sim.releaseLaunch();
  run(sim, secs(8));
  assert.equal(count('skillShot'), 1, 'skill shot on the Kingdom table');
  for (const id of ['mush1', 'mush2', 'mush3', 'shield1', 'shield2', 'shield3']) { r.cooldowns.clear(); r.onElementHit(id, 0, 0); }
  assert.equal(count('rushStart'), 1);
});
