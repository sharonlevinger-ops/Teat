// Shared test helper (not a test file itself).
/** A simple "player": flips when a falling ball is over the outer part of a flipper, then rests a moment. */
export function botFlippers(sim, hold, rnd) {
  for (const f of sim.world.flippers) {
    const s = f.side;
    if (hold[s] > 0) { if (--hold[s] === 0) { sim.setFlipper(s, false); hold['cd' + s] = 25; } continue; }
    if (hold['cd' + s] > 0) { hold['cd' + s]--; continue; }
    for (const b of sim.world.balls) {
      if (!b.active || b.mode !== 'free' || b.vy > 0) continue;
      const dx = Math.cos(f.rest), dy = Math.sin(f.rest);
      const t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / f.len;
      const off = (b.x - f.px) * -dy + (b.y - f.py) * dx;
      if (t > 0.3 + rnd() * 0.3 && t < 1.05 && Math.abs(off) < 2.2) { sim.setFlipper(s, true); hold[s] = 14 + Math.floor(rnd() * 8); break; }
    }
  }
}
