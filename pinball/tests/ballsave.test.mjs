// Ball save: a ball lost within 15 s of launch comes back to the plunger; later it counts as lost.
import test from 'node:test';
import assert from 'node:assert';
import { Physics } from '../js/physics.js';
import { Game, BALL_SAVE_SECONDS } from '../js/game.js';
import * as L from '../js/layout.js';

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const msgs = [];
const world = { lamps: new Map(), fx() {}, setMood() {} };
const sound = { play() {}, setRoll() {}, intensity: 0 };
const ui = { message: (t) => msgs.push(t), popup() {}, toast() {}, bonus() {}, gameOver() {} };

function launchAndDrainAfter(sec) {
  const p = new Physics(); const g = new Game(p, world, sound, ui);
  g.startGame();
  const b = p.balls[0];
  b.launched = true; g.onLaunched(); // what the physics hook does when the ball leaves the plunger lane
  for (let t = 0; t < sec; t += 0.1) g.update(0.1);
  b.mode = 'field'; b.x = L.CX; b.y = L.DRAIN_Y + 4; // drain it
  g.update(0.016);
  return g;
}

test('ball save lasts 15 seconds', () => {
  assert.equal(BALL_SAVE_SECONDS, 15);
  const saved = launchAndDrainAfter(14);
  assert.equal(saved.ballNum, 1, 'still ball 1');
  assert.equal(saved.phys.balls.length, 1, 'ball returned to the plunger');
  assert.ok(msgs.includes('הכדור ניצל!'));
  const lost = launchAndDrainAfter(16);
  assert.equal(lost.phys.balls.length, 0, 'ball lost after the save window');
});
