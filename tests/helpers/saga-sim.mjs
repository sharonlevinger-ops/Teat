// Shared helpers for the saga (painted table) tests – not a test file itself.
import { Simulation } from '../../saga/js/core/sim.js';
import { HZ } from '../../saga/js/core/config.js';

export { Simulation };

/** Drop a resting ball on a grid over the table; report spots where it stays put. */
export function findDeadSpots({ step = 0.5, seconds = 8, flippersUp = false, enclosed = () => false, table = 'forest' } = {}) {
  const dead = [];
  const sim = new Simulation(undefined, table);
  sim.rules.state = 'playing';
  const w = sim.world, b = w.balls[0];
  if (flippersUp) { w.setFlipper('L', true); w.setFlipper('R', true); }
  const PZ = sim.table.plungerZone;
  for (let y = 0.5; y < 40.5; y += step) {
    for (let x = 0.4; x < 21.9; x += step) {
      if (enclosed(x, y, sim)) continue;
      sim._place(b, x, y, 0, 0, 'free');
      let blocked = false;
      for (let i = 0; i < 3 && !blocked; i++) { w.step(1 / HZ); if (Math.hypot(b.x - x, b.y - y) > 0.3) blocked = true; }
      if (blocked) continue;
      sim._place(b, x, y, 0, 0, 'free');
      let rest = 0;
      for (let i = 0; i < seconds * HZ; i++) {
        w.step(1 / HZ);
        if (!b.active || b.y < -1 || b.mode !== 'free') break;
        if (b.x > PZ.minX && b.y < PZ.maxY) break; // reached the plunger
        if (Math.hypot(b.vx, b.vy) < 0.25) rest++; else rest = 0;
        if (rest > HZ * 1.5) { dead.push([+x.toFixed(2), +y.toFixed(2), +b.x.toFixed(2), +b.y.toFixed(2)]); break; }
      }
    }
  }
  return dead;
}

/** Areas a ball can never reach: inside the tower and outside the cabinet walls. */
export function outsideOrEnclosed(x, y, sim) {
  const t = sim.table.decor.tower;
  if (Math.hypot(x - t.x, y - t.y) < t.r + 0.5) return true;
  // outside the boundary polygon (outer wall + lane floor): ray casting against the first wall
  if (!insideCabinet(x, y, sim)) return true;
  for (const c of sim.table.circles) if (Math.hypot(x - c.x, y - c.y) < c.r + 0.3) return true;
  for (const w of sim.table.walls) if (w.solidPoly && pointInPoly(x, y, w.solidPoly)) return true;
  return false;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

import { artToFlat } from '../../saga/js/core/artmap.js';
const cabinetCache = new WeakMap();
/** inside the outer wall (closed underneath the drain, launch lane included) */
export function insideCabinet(x, y, sim) {
  let poly = cabinetCache.get(sim.table);
  if (!poly) { poly = [...sim.table.walls[0].pts, artToFlat(1245, 2400), artToFlat(98, 2400)]; cabinetCache.set(sim.table, poly); }
  return pointInPoly(x, y, poly);
}
