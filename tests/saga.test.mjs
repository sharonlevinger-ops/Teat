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
    botFlippers(sim, hold, rnd);
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

test('timers are exact on the painted table too (door 20 s, RUSH 30 s)', () => {
  const { sim } = newGame();
  const r = sim.rules;
  for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); }
  const start = sim.tick;
  while (r.doorOpen) sim.step();
  assert.equal(sim.tick - start, secs(TIMING.DOOR_OPEN));
});
