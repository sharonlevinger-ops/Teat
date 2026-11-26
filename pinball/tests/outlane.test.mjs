// Outlane save: the first ball into an outlane is kicked back (once per ball), the second drains.
import test from 'node:test';
import assert from 'node:assert';
import { Physics } from '../js/physics.js';
import { Game } from '../js/game.js';
import * as L from '../js/layout.js';

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const world = { lamps: new Map(), fx() {}, setMood() {} };
const sound = { play() {}, setRoll() {}, intensity: 0 };
const ui = { message() {}, popup() {}, toast() {}, bonus() {}, gameOver() {} };

function dropInto(p, g, x) {
  const b = p.balls[0];
  b.mode = 'field'; b.x = x; b.y = 960; b.vx = 0; b.vy = 200; b.launched = true; b.outlane = false;
  let t = 0, lowest = 0, rose = false;
  while (t < 2.5) {
    p.step(1 / 60); g.update(1 / 60); t += 1 / 60;
    if (!p.balls[0] || p.balls[0] !== b) return { drained: true, rose };
    lowest = Math.max(lowest, b.y);
    if (lowest > 1040 && b.y < 900) rose = true;
  }
  return { drained: false, rose };
}

for (const [side, x] of [['left', 72], ['right', 650]]) {
  test(`${side} outlane: saved once, then lost`, () => {
    const p = new Physics(); const g = new Game(p, world, sound, ui);
    g.startGame(); g.ballSave = 0;
    const first = dropInto(p, g, x);
    assert.equal(first.drained, false, 'first outlane ball is saved');
    assert.equal(first.rose, true, 'ball is kicked back up');
    assert.equal(g.kick.L || g.kick.R, false, 'save used up');
    g.ballSave = 0;
    const ballBefore = g.ballNum;
    const second = dropInto(p, g, x);
    assert.equal(second.drained, true, 'second outlane ball drains');
    assert.equal(g.ballNum, ballBefore);
  });
}
