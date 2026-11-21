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
  assert.deepEqual(r.goal, { text: 'SKILL SHOT · RELEASE ON THE GOLD FLASH', target: 'mush3', sub: 'CHAPTER 2 IN 15,000' });
  sim.pressLaunch(); run(sim, secs(1)); sim.releaseLaunch(); run(sim, 5);
  assert.deepEqual(r.goal, { text: 'WIZARD · 3 MORE HITS OPEN THE TOWER', target: 'wizard', sub: 'CHAPTER 2 IN 15,000' });
  r.onWizardHit(0, 0);
  assert.match(r.goal.text, /2 MORE HITS/);
  for (let i = 0; i < 2; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  assert.equal(r.goal.target, 'door');
  assert.match(r.goal.text, /OPEN TOWER/);
  const b = sim.world.balls.find((x) => x.active);
  r.onTowerEnter(b);
  assert.match(r.goal.text, /SUPER JACKPOT/);
  r.score = 50000; r._checkStage();
  assert.equal(r.goal.sub, 'FINAL CHAPTER');
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
  const fire = (m) => { const def = MISSION_POOL.find((x) => x.id === m.id); const payload = { wizardHit: {}, doorOpen: {}, ramp: { id: m.id === 'rampA3' ? 'rampA' : 'rampB' }, rushStart: {}, multiballStart: {}, skillShot: {}, loop: {}, element: { id: 'mush1' }, stage: { index: 1 }, comboChain: { level: 5 }, score: { total: 60000 } }[def.ev]; for (let i = 0; i < def.n; i++) bus.emit(def.ev, payload); };
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
