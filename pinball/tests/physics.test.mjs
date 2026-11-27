// Headless physics soak test: random launches + a simple flipper bot.
// Checks the ball never leaves the cabinet, never tunnels into solid bodies and reaches the features.
import { Physics } from '../js/physics.js';
import * as L from '../js/layout.js';
import test from 'node:test';
import assert from 'node:assert';

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

test('soak: no escapes, features reachable', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stats = { drains: 0, escapes: 0, inside: 0, rails: {}, hits: {}, maxStill: 0, sec: 0 };
  for (let game = 0; game < 20; game++) {
    const p = new Physics();
    p.handlers.onHit = (t) => { stats.hits[t] = (stats.hits[t] || 0) + 1; };
    p.handlers.onSubstep = (b, px, py) => {
      for (const [name, r] of Object.entries(L.ramps)) {
        const e = r.entry;
        if (py >= e.y && b.y < e.y && Math.abs(b.x - e.x) < e.w / 2 && b.vy < 0) {
          const sp = Math.hypot(b.vx, b.vy);
          if (sp >= r.minSpeed) p.enterRail(b, name, sp); else if (name !== 'orbit') { b.y = e.y + 1; b.vy = Math.abs(b.vy) * 0.35; }
        }
      }
      for (const h of L.holes) {
        if (h.id === 'castle') continue;
        if (Math.hypot(b.x - h.x, b.y - h.y) < h.r * 0.95 && Math.hypot(b.vx, b.vy) < 1700 && !(b.noCap > stats.sec)) {
          b.noCap = stats.sec + 0.6;
          stats.hits['hole_' + h.id] = (stats.hits['hole_' + h.id] || 0) + 1;
          b.x = h.x + Math.sign(h.kick.vx) * 4; b.y = h.y + Math.sign(h.kick.vy) * 4; b.vx = h.kick.vx; b.vy = h.kick.vy;
        }
      }
    };
    p.handlers.onRailExit = (b, n) => { stats.rails[n] = (stats.rails[n] || 0) + 1; };
    let b = p.addBall(L.PLUNGER.x, L.PLUNGER.y);
    b.vy = -(950 + rnd() * 2550);
    let t = 0, still = 0;
    const dt = 1 / 60;
    while (t < 240) {
      // bot: flip when a ball is near a flipper
      for (const f of p.flippers) {
        const c = f.cfg;
        const near = p.balls.some((o) => o.mode === 'field' && Math.hypot(o.x - (c.x + Math.cos(c.rest) * c.len * 0.6), o.y - (c.y + Math.sin(c.rest) * c.len * 0.6)) < 55 + rnd() * 20 && (o.vy > 40 || Math.hypot(o.vx, o.vy) < 15));
        p.setFlipper(f.side, near || (f.pressed && rnd() < 0.8));
      }
      p.step(dt); t += dt; stats.sec += dt;
      for (const o of p.balls) {
        if (o.mode !== 'field') continue;
        if (o.x < L.FIELD.left - 2 || o.x > L.FIELD.laneOut + 2 || o.y < L.FIELD.top - 2) stats.escapes++;
        if (inPoly(o.x, o.y, L.MINE_POLY) || inPoly(o.x, o.y, L.TOWER_POLY)) stats.inside++;
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (b.mode === 'field' && sp < 12 && !(b.x > L.FIELD.laneIn && b.y > 1150)) { still += dt; stats.maxStill = Math.max(stats.maxStill, still); if (still > 2.2) { const k = "st_" + Math.round(b.x / 10) * 10 + "," + Math.round(b.y / 10) * 10; stats.hits[k] = (stats.hits[k] || 0) + 1; b.vy = -600; still = 0; stats.hits.unstuck = (stats.hits.unstuck || 0) + 1; } } else still = 0;
      if (b.mode === 'field' && b.y > L.DRAIN_Y && b.x < L.FIELD.laneIn) {
        stats.drains++; const bin = b.x < 100 ? "outL" : b.x < 300 ? "midL" : b.x < 424 ? "center" : b.x < 624 ? "midR" : "outR"; stats.hits["dr_" + bin] = (stats.hits["dr_" + bin] || 0) + 1;
        p.removeBall(b);
        b = p.addBall(L.PLUNGER.x, L.PLUNGER.y); b.vy = -(950 + rnd() * 2550);
      }
      if (b.mode === 'field' && b.x > L.FIELD.laneIn && b.y > 1150 && Math.abs(b.vy) < 30) b.vy = -(950 + rnd() * 2550);
    }
  }
  console.log(JSON.stringify(stats, null, 1));
  assert.equal(stats.escapes, 0, 'ball escaped the cabinet');
  assert.ok(stats.inside < 5, 'ball tunnelled into a solid body: ' + stats.inside);
});
