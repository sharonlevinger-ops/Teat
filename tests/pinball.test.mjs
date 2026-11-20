// Forest Pinball Saga – headless QA for physics and game rules (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../pinball/js/core/sim.js';
import { HZ, SCORE, TIMING, STAGES, PHYS } from '../pinball/js/core/config.js';
import { botFlippers } from './helpers/pinball-bot.mjs';
import { findDeadSpots } from './helpers/deadspots.mjs';

const R = PHYS.BALL_R;
const secs = (s) => Math.round(s * HZ);

function newGame() {
  const sim = new Simulation();
  const events = [];
  sim.bus.on('*', (type, p) => events.push({ type, p: p && typeof p === 'object' ? { ...p } : p, tick: sim.tick }));
  sim.rules.startGame();
  return { sim, events, count: (t) => events.filter((e) => e.type === t).length };
}

function run(sim, ticks, each) {
  for (let i = 0; i < ticks; i++) { sim.step(); if (each) each(i); }
}

/** keeps every free ball on the table (for timer tests that must not lose balls) */
function keepAlive(sim) {
  for (const b of sim.world.balls) if (b.active && b.mode === 'free' && b.y < 9) { b.y = 20; b.x = 9.9; b.vx = 3; b.vy = 4; }
}

function freeBall(sim) {
  const b = sim.heldBall();
  b.mode = 'free';
  return b;
}

// ------------------------------------------------------------------------------------------- physics
test('no tunnelling: ball at max speed never crosses a wall', () => {
  const sim = new Simulation();
  const w = sim.world;
  const b = w.balls[0];
  for (const angle of [180, 170, 200, 135, 225]) {
    sim._place(b, 6, 18, 0, 0, 'free');
    b.vx = Math.cos((angle * Math.PI) / 180) * PHYS.MAX_SPEED;
    b.vy = Math.sin((angle * Math.PI) / 180) * PHYS.MAX_SPEED;
    w.gravity = 0;
    for (let i = 0; i < 240; i++) {
      w.step(1 / HZ);
      assert.ok(b.x >= 0.6 + R - 1e-6, `crossed left wall at angle ${angle}: x=${b.x}`);
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
    }
  }
});

test('no tunnelling: fast ball vs a flipper swinging up never passes through it', () => {
  for (const startX of [6.8, 7.6, 8.4]) {
    const sim = new Simulation();
    const w = sim.world;
    const f = w.flippers[0];
    const b = w.balls[0];
    sim._place(b, startX, 9, 0, -PHYS.MAX_SPEED, 'free');
    let flipped = false;
    for (let i = 0; i < 120; i++) {
      if (!flipped && b.y < 7) { w.setFlipper('L', true); flipped = true; }
      w.step(1 / HZ);
      // the ball must stay above the flipper's centre line wherever it overlaps the flipper horizontally
      const dx = f.tx - f.px, dy = f.ty - f.py;
      const t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / (dx * dx + dy * dy);
      if (t > 0.05 && t < 0.95) {
        const side = (b.x - f.px) * -dy + (b.y - f.py) * dx; // >0 = above (left normal)
        assert.ok(side > 0, `ball went through the flipper (startX=${startX}, step ${i})`);
      }
    }
    assert.ok(b.vy > 0 || b.y > 5, 'flipper should have sent the ball back up');
  }
});

test('one-way gate lets the plunged ball out and keeps returning balls out of the shooter lane', () => {
  const sim = new Simulation();
  const b = sim.world.balls[0];
  sim.world.gravity = 0;
  sim._place(b, 19.8, 28, 0, 30, 'free');
  run(sim, 30);
  assert.ok(b.y > 31, 'launched ball passes the gate');
  sim._place(b, 19.9, 33.5, -1, -20, 'free');
  sim.world.gravity = PHYS.GRAVITY;
  run(sim, 60);
  assert.ok(!(b.x > 19.2 && b.y < 30), `returning ball must not drop into the shooter lane (x=${b.x}, y=${b.y})`);
});

test('no dead spots: a ball dropped anywhere on the table never comes to rest (flippers down)', () => {
  const dead = findDeadSpots({ step: 0.5 });
  assert.deepEqual(dead, [], `ball rests at: ${JSON.stringify(dead.slice(0, 10))}`);
});

test('with flippers held up the only resting places are the two cradles', () => {
  const dead = findDeadSpots({ step: 1 });
  const up = findDeadSpots({ step: 1, flippersUp: true });
  assert.equal(dead.length, 0);
  for (const [, , x, y] of up) assert.ok(y < 7 && (Math.abs(x - 6) < 0.6 || Math.abs(x - 13.8) < 0.6), `unexpected rest at ${x},${y}`);
});

// ------------------------------------------------------------------------------------------- launch / skill shot
test('launch: no rapid re-launch, skill shot only on the first launch', () => {
  const { sim, count } = newGame();
  assert.ok(sim.heldBall(), 'ball waits on the plunger');
  assert.equal(sim.pressLaunch(), true);
  run(sim, 30);
  assert.equal(sim.releaseLaunch(), true);
  assert.equal(sim.pressLaunch(), false, 'cannot pull again while the ball is in flight');
  assert.equal(sim.releaseLaunch(), false);
  assert.equal(count('launch'), 1);
  assert.equal(sim.rules.skillAvailable, false);
  // ball returns to the plunger (weak launch) -> may launch again, but no skill shot
  const b = sim.world.balls.find((x) => x.active);
  sim._place(b, 19.8, 1.6, 0, 0, 'free');
  run(sim, secs(TIMING.LAUNCH_COOLDOWN) + 5);
  assert.ok(sim.heldBall(), 'ball is back on the plunger');
  sim.rules.skillPhase = 0; // indicator lit
  sim.pressLaunch(); run(sim, 5); sim.releaseLaunch();
  assert.equal(sim.rules.skillArmed, false, 'skill shot never arms after the first launch');
});

test('skill shot: releasing while the indicator is lit hits the mushroom for 5,000 (real physics)', () => {
  const { sim, count, events } = newGame();
  run(sim, 100);
  sim.pressLaunch();
  // hold until the next lit window starts
  run(sim, 1, () => {});
  while (!sim.rules.skillLit || sim.plunger.power < 0.5) sim.step();
  sim.releaseLaunch();
  assert.equal(sim.rules.skillArmed, true);
  run(sim, secs(4));
  assert.equal(count('skillShot'), 1, 'skill shot awarded');
  const award = events.find((e) => e.type === 'score' && e.p.reason === 'skillShot');
  assert.equal(award.p.points, SCORE.SKILL_SHOT);
});

test('skill shot: releasing while the indicator is dark gives no bonus', () => {
  const { sim, count } = newGame();
  sim.rules.skillPhase = secs(TIMING.SKILL_LIT) + 2; // dark
  sim.pressLaunch(); run(sim, 20); sim.releaseLaunch();
  assert.equal(sim.rules.skillArmed, false);
  run(sim, secs(4));
  assert.equal(count('skillShot'), 0);
});

// ------------------------------------------------------------------------------------------- modes
test('RUSH COMBO: all 6 elements activate exactly 30 s of x2; cannot re-trigger while active', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  const ids = ['mush1', 'crystal2', 'potion', 'mush3', 'crystal1'];
  for (const id of ids) { r.onElementHit(id, 0, 0); run(sim, 20); }
  assert.equal(r.rushActive, false);
  r.onElementHit('mush1', 0, 0); run(sim, 20); // duplicate does not complete the set
  assert.equal(r.rushActive, false);
  r.onElementHit('mush2', 0, 0);
  assert.equal(r.rushActive, true);
  assert.equal(r.multiplier, 2.0);
  const start = sim.tick;
  // hitting everything again while RUSH is running must not extend or restart it
  for (const id of ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion']) { run(sim, 20); r.onElementHit(id, 0, 0); }
  assert.equal(r.combo.size, 0);
  while (r.rushActive) sim.step();
  assert.equal(sim.tick - start, secs(TIMING.RUSH), 'RUSH lasts exactly 30 s');
  assert.equal(count('rushStart'), 1);
  assert.equal(count('rushEnd'), 1);
  assert.equal(r.multiplier, r.stage.mult, 'only the chapter multiplier is left after RUSH');
});

test('scoring: chapter multiplier × RUSH multiplier, chapter change applies from the next award', () => {
  const { sim } = newGame();
  const r = sim.rules;
  r.chainTicks = 0; r.onElementHit('mush1', 0, 0);
  assert.equal(r.lastAward.points, 100);
  r.score = 14990;
  run(sim, 30);
  r.chainTicks = 0; r.onElementHit('mush1', 0, 0); // crosses 15,000 with the old multiplier
  assert.equal(r.lastAward.points, 100);
  assert.equal(r.score, 15090, 'no score jump at the chapter change');
  assert.equal(r.stage.id, 2);
  run(sim, 30);
  r.chainTicks = 0; r.onElementHit('mush1', 0, 0);
  assert.equal(r.lastAward.points, 150);
  r.rushTicks = 100;
  run(sim, 30);
  r.chainTicks = 0; r.onElementHit('mush1', 0, 0);
  assert.equal(r.lastAward.points, 300, '100 × 1.5 × 2');
  r.score = 40000; r._checkStage();
  assert.equal(r.stage.id, 3);
  run(sim, 30);
  r.onWizardHit(0, 0);
  assert.equal(r.lastAward.points, 1000, '250 × 2.0 × 2');
  assert.deepEqual(STAGES.map((s) => s.mult), [1, 1.5, 2]);
});

test('Combo Chain: hits within 3 s build x2, x3… with a growing bonus, then reset', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  r.onElementHit('mush1', 0, 0);
  assert.equal(r.chain, 1);
  run(sim, secs(1));
  r.onRamp('rampA');
  assert.equal(r.chain, 2);
  assert.equal(r.lastAward.reason, 'comboChain');
  assert.equal(r.lastAward.points, 250);
  run(sim, secs(2));
  r.onElementHit('crystal1', 0, 0);
  assert.equal(r.chain, 3);
  assert.equal(r.lastAward.points, 500);
  run(sim, secs(TIMING.COMBO_WINDOW) + 1);
  assert.equal(r.chain, 0, 'chain expires after 3 s without a hit');
  assert.equal(count('comboChain'), 2);
  assert.equal(count('comboChainEnd'), 1);
});

test('Wizard: 3 hits open the tower door for exactly 20 s, then it closes and the charge resets', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  freeBall(sim);
  for (let i = 0; i < 3; i++) { r.onWizardHit(0, 0); run(sim, 30, () => keepAlive(sim)); }
  assert.equal(count('doorOpen'), 1);
  assert.equal(sim.world.toggles.doorOpen, true);
  assert.equal(sim.world.toggles.doorClosed, false);
  const opened = r.doorTicks + sim.tick;
  while (r.doorOpen) { sim.step(); keepAlive(sim); }
  assert.equal(sim.tick, opened);
  assert.equal(count('doorClose'), 1);
  assert.equal(r.wizardCharge, 0);
  assert.equal(sim.world.toggles.doorClosed, true);
});

test('MULTIBALL: tower entry = 15,000 + 4 balls; extras removed exactly at 60 s; super jackpot 25,000', () => {
  const { sim, count, events } = newGame();
  const r = sim.rules;
  const b = freeBall(sim);
  for (let i = 0; i < 3; i++) { r.onWizardHit(0, 0); run(sim, 20, () => keepAlive(sim)); }
  const scoreBefore = r.score;
  b.x = 9.9; b.y = 29.9; b.vx = 0; b.vy = 1;
  sim._onSensor(b, sim.world.sensors.find((s) => s.id === 'towerIn'));
  assert.equal(r.multiball, true);
  assert.equal(r.score - scoreBefore, SCORE.TOWER_ENTRY);
  assert.equal(r.guests, 1);
  assert.equal(sim.activeBallCount(), 4);
  const start = sim.tick;
  run(sim, secs(2), () => keepAlive(sim));
  assert.equal(sim.world.balls.filter((x) => x.active && x.mode !== 'tower').length, 4, 'all 4 balls on the table');
  assert.ok(r.stage.id >= 2, 'the 15,000 tower bonus moved the game into chapter 2');
  run(sim, secs(TIMING.DOOR_HIT_COOLDOWN), () => keepAlive(sim));
  const mult = r.multiplier;
  r.onDoorHit(9.9, 29);
  const jp = events.filter((e) => e.type === 'score' && e.p.reason === 'superJackpot').pop();
  assert.equal(jp.p.points, SCORE.SUPER_JACKPOT * mult, 'super jackpot 25,000 × chapter multiplier');
  while (r.multiball) { sim.step(); keepAlive(sim); }
  assert.equal(sim.tick - start, secs(TIMING.MULTIBALL), 'multiball lasts exactly 60 s');
  assert.equal(sim.activeBallCount(), 1, 'extra balls are gone, one ball keeps playing');
  assert.equal(count('ballDissolve'), 3);
  assert.equal(r.ball, 1);
  run(sim, secs(1), () => keepAlive(sim));
  assert.equal(sim.activeBallCount(), 1, 'nothing stays behind on the table');
});

test('MULTIBALL: losing the balls before the timer ends the mode without costing a ball', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  const b = freeBall(sim);
  for (let i = 0; i < 3; i++) { r.onWizardHit(0, 0); run(sim, 20, () => keepAlive(sim)); }
  sim._onSensor(b, sim.world.sensors.find((s) => s.id === 'towerIn'));
  run(sim, secs(2), () => keepAlive(sim));
  const balls = sim.world.balls.filter((x) => x.active);
  for (const x of balls.slice(0, 3)) r.onDrain(x);
  assert.equal(r.multiball, false);
  assert.equal(count('multiballEnd'), 1);
  assert.equal(sim.activeBallCount(), 1);
  assert.equal(r.ball, 1);
});

test('kickback saves an outlane ball once; potion relights it; last drain = game over', () => {
  const { sim, count } = newGame();
  const r = sim.rules;
  const b = freeBall(sim);
  sim._place(b, 1.3, 9, 0, -20, 'free');
  run(sim, secs(0.5));
  assert.equal(count('kickbackFire'), 1);
  assert.ok(b.vy > 0 || b.y > 6, 'ball is kicked back up');
  assert.equal(r.kickbackLit, false);
  run(sim, 30);
  r.onElementHit('potion', 0, 0);
  assert.equal(r.kickbackLit, true);
  // drain all three balls
  for (let n = 1; n <= 3; n++) {
    const ball = sim.world.balls.find((x) => x.active) || (run(sim, secs(2)), sim.world.balls.find((x) => x.active));
    r.onDrain(ball);
    if (n < 3) { assert.equal(r.ball, n + 1); run(sim, secs(2)); assert.ok(sim.heldBall(), 'next ball served'); }
  }
  assert.equal(r.state, 'gameover');
  assert.equal(count('gameOver'), 1);
});

// ------------------------------------------------------------------------------------------- soak test

test('soak: 15 minutes of bot play – no escapes, no NaN, every target reachable', () => {
  const sim = new Simulation();
  const seen = new Set();
  let rescues = 0, escapes = 0;
  sim.bus.on('element', (p) => seen.add(p.id));
  sim.bus.on('wizardHit', () => seen.add('wizard'));
  sim.bus.on('ramp', (p) => seen.add(p.id));
  sim.bus.on('loop', () => seen.add('loop'));
  sim.bus.on('ballRescue', () => rescues++);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hold = { L: 0, R: 0, cdL: 0, cdR: 0 };
  let pull = 0;
  sim.rules.startGame();
  const total = secs(15 * 60);
  for (let i = 0; i < total; i++) {
    if (sim.rules.state !== 'playing') sim.rules.startGame();
    botFlippers(sim, hold, rnd);
    if (sim.heldBall() && sim.canLaunch()) {
      if (!sim.plunger.pulling) { sim.pressLaunch(); pull = 20 + Math.floor(rnd() * 100); } else if (--pull <= 0) sim.releaseLaunch();
    }
    sim.step();
    for (const b of sim.world.balls) {
      if (!b.active) continue;
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'NaN position');
      if (b.mode === 'free' && (b.x < 0.6 + R - 0.05 || b.x > 20.4 - R + 0.05)) escapes++;
    }
  }
  console.log(`  targets seen: ${[...seen].sort().join(', ')}; rescues: ${rescues}; score: ${sim.rules.score}`);
  assert.equal(escapes, 0, 'a ball left the cabinet');
  for (const id of ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'wizard', 'rampA', 'rampB']) {
    assert.ok(seen.has(id), `target never hit in 15 min of play: ${id}`);
  }
  assert.ok(rescues < 15, `too many stuck-ball rescues: ${rescues}`);
});
