// Game-rule soak test with stubbed world/sound/ui: runs whole games with a flipper bot,
// forces every mode, and checks nothing throws and scoring/flow behave.
import test from 'node:test';
import assert from 'node:assert';
import { Physics } from '../js/physics.js';
import { Game } from '../js/game.js';
import * as L from '../js/layout.js';

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const lamps = new Map();
const world = { lamps, fx() {}, setMood(m) { this.mood = m; } };
const sound = { play() {}, setRoll() {}, intensity: 0 };
const msgs = [];
const ui = { message: (t) => msgs.push(t), popup() {}, toast: (t) => msgs.push(t), bonus() {}, gameOver: (r) => { ui.result = r; } };

function runGame(seedBot, forceModes) {
  const p = new Physics();
  const g = new Game(p, world, sound, ui);
  g.startGame();
  let t = 0; const dt = 1 / 60;
  let forced = false;
  while (g.state === 'playing' && t < 1200) {
    for (const f of p.flippers) {
      const c = f.cfg;
      const near = p.balls.some((o) => o.mode === 'field' && Math.hypot(o.x - (c.x + Math.cos(c.rest) * c.len * 0.6), o.y - (c.y + Math.sin(c.rest) * c.len * 0.6)) < 60 && o.vy > 40);
      p.setFlipper(f.side, near);
    }
    if (g.ballInLane()) g.plungerLaunch(0.5 + Math.random() * 0.5);
    if (forceModes && !forced && t > 5) {
      forced = true;
      g.openGate();
      const b = p.balls[0]; if (b) { b.mode = 'field'; b.x = 527; b.y = 480; b.vx = 0; b.vy = -400; }
    }
    p.step(dt); g.update(dt); t += dt;
  }
  return { g, t };
}

test('full games run to completion with a bot', () => {
  for (let i = 0; i < 6; i++) {
    const { g, t } = runGame(i, i % 2 === 1);
    assert.equal(g.state, 'over', 'game should end (t=' + t.toFixed(0) + ')');
    assert.ok(g.score > 0);
  }
  assert.ok(ui.result.best.score > 0, 'high score saved');
  assert.ok(JSON.parse(mem.fcp_best_v1).score > 0);
  const seen = new Set(msgs);
  console.log('messages seen:', [...seen].slice(0, 40).join(' | '));
  assert.ok([...seen].some((m) => m.includes('הצילו את הנסיכה')), 'castle multiball started');
});

test('tower locks start wizard multiball and it ends at one ball', () => {
  const p = new Physics();
  const g = new Game(p, world, sound, ui);
  g.startGame();
  const hole = L.holes.find((h) => h.id === 'tower');
  for (let i = 0; i < 3; i++) {
    const b = p.balls[0]; b.mode = 'field'; b.noCap = 0; b.x = hole.x; b.y = hole.y + 40; b.vx = 0; b.vy = -500;
    for (let k = 0; k < 300; k++) { p.step(1 / 60); g.update(1 / 60); }
  }
  assert.equal(g.multiball, 'wizard');
  for (let k = 0; k < 240; k++) { p.step(1 / 60); g.update(1 / 60); }
  assert.equal(p.balls.length, 3, 'three balls in play');
  // drain two
  g.ballSave = 0;
  p.balls[0].mode = 'field'; p.balls[0].x = 362; p.balls[0].y = L.DRAIN_Y + 5; g.update(0.016);
  p.balls[0].mode = 'field'; p.balls[0].x = 362; p.balls[0].y = L.DRAIN_Y + 5; g.update(0.016);
  assert.equal(g.multiball, false);
  assert.equal(p.balls.length, 1);
});
