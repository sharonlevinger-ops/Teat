// Drops a ball at rest on a grid over the whole playfield and reports every spot where it stays put.
import { Simulation } from '../../pinball/js/core/sim.js';
import { HZ } from '../../pinball/js/core/config.js';

// enclosed areas a ball can never reach from the playfield
const ENCLOSED = [
  (x, y) => Math.hypot(x - 9.9, y - 31.2) < 2.4, // inside the tower (door closed)
  (x, y) => Math.hypot(x - 8.35, y - 24.4) < 1.0 || Math.hypot(x - 16.6, y - 19.2) < 1.0, // inside crystals
  (x, y) => (x > 4.9 && x < 6.5 && y > 24.4 && y < 25.3) || (x > 14 && x < 15.6 && y > 24.6 && y < 25.5), // ramp roofs
];

export function findDeadSpots({ step = 0.5, seconds = 8, flippersUp = false } = {}) {
  const dead = [];
  const sim = new Simulation();
  sim.rules.state = 'playing';
  const w = sim.world;
  const b = w.balls[0];
  if (flippersUp) { w.setFlipper('L', true); w.setFlipper('R', true); }
  for (let y = 1; y < 39.5; y += step) {
    for (let x = 0.8; x < 20.3; x += step) {
      if (ENCLOSED.some((f) => f(x, y))) continue;
      sim._place(b, x, y, 0, 0, 'free');
      // skip spots inside solid geometry
      let blocked = false;
      for (let i = 0; i < 3 && !blocked; i++) { w.step(1 / HZ); if (Math.hypot(b.x - x, b.y - y) > 0.3) blocked = true; }
      if (blocked) continue;
      sim._place(b, x, y, 0, 0, 'free');
      let rest = 0;
      for (let i = 0; i < seconds * HZ; i++) {
        w.step(1 / HZ);
        if (!b.active || b.y < -1 || b.mode !== 'free') break;
        if (b.x > 19.2 && b.y < 2.4) break; // reached the plunger
        if (Math.hypot(b.vx, b.vy) < 0.25) rest++; else rest = 0;
        if (rest > HZ * 1.5) { dead.push([+x.toFixed(2), +y.toFixed(2), +b.x.toFixed(2), +b.y.toFixed(2)]); break; }
      }
    }
  }
  return dead;
}
