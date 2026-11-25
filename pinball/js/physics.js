// 2D rigid-ball pinball physics with sub-stepping, capsule colliders, rotating flippers,
// one-way gates, active bumpers/slings and 3D rail (ramp) following.
import * as L from './layout.js';

const R = L.BALL_R;
export const GRAVITY = 1950; // px/s² along the table (y+)
const MAX_SPEED = 3700;
const SUBSTEPS = 12;

function seg(ax, ay, bx, by, o = {}) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  return { ax, ay, bx, by, dx, dy, len, ux: dx / len, uy: dy / len, t: o.t ?? 3, e: o.e ?? 0.42, f: o.f ?? 0.04, kind: o.kind || 'wall', tag: o.tag, enabled: true, oneWay: o.oneWay, nx: o.nx, ny: o.ny };
}

export class Rail {
  constructor(pts) {
    // densify with Catmull-Rom
    const P = pts.map((p) => ({ x: p[0], y: p[1], h: p[2] }));
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const n = 14;
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), h: cr(p0.h, p1.h, p2.h, p3.h) });
      }
    }
    out.push({ ...P[P.length - 1] });
    let s = 0;
    out[0].s = 0;
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i];
      s += Math.hypot(b.x - a.x, b.y - a.y, b.h - a.h);
      b.s = s;
    }
    this.samples = out;
    this.length = s;
  }
  at(s) {
    const S = this.samples;
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid].s < s) lo = mid; else hi = mid; }
    const a = S[lo], b = S[hi], f = (s - a.s) / ((b.s - a.s) || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f, slope: (b.h - a.h) / ((b.s - a.s) || 1) };
  }
}

export class Physics {
  constructor() {
    this.balls = [];
    this.segs = [];
    this.circles = [];
    this.flippers = [];
    this.handlers = {}; // onHit(type, ball, obj, speed), onSubstep(ball, px, py)
    this.plunger = { pull: 0, y: L.PLUNGER.y + R };
    this.rails = Object.fromEntries(Object.entries(L.ramps).map(([k, r]) => [k, new Rail(r.pts)]));
    this.build();
  }

  build() {
    for (const w of L.walls) {
      const pts = w.points;
      const n = w.closed ? pts.length : pts.length - 1;
      const kind = w.kind;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        this.segs.push(seg(a[0], a[1], b[0], b[1], { kind, e: kind === 'rock' ? 0.32 : kind === 'rubber' ? 0.72 : 0.4, t: 2.5 }));
      }
    }
    for (const p of L.posts) this.circles.push({ x: p.x, y: p.y, r: p.r, e: 0.7, kind: 'post', enabled: true });
    for (const b of L.bumpers) this.circles.push({ x: b.x, y: b.y, r: b.r, e: 0.5, kind: 'bumper', tag: b, enabled: true });
    for (const s of L.slings) {
      const g = seg(s.a[0], s.a[1], s.b[0], s.b[1], { kind: 'sling', tag: s, e: 0.6, t: 4 });
      // normal pointing toward the centre of the table
      let nx = -g.uy, ny = g.ux;
      const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2;
      if ((L.CX - mx) * nx + (900 - my) * ny < 0) { nx = -nx; ny = -ny; }
      g.knx = nx; g.kny = ny;
      this.segs.push(g);
    }
    for (const d of L.dropTargets) {
      const g = seg(d.a[0], d.a[1], d.b[0], d.b[1], { kind: 'drop', tag: d, e: 0.35, t: 5 });
      d.seg = g; this.segs.push(g);
    }
    for (const t of L.shieldTargets) this.circles.push({ x: t.x, y: t.y, r: t.r, e: 0.5, kind: 'shield', tag: t, enabled: true });
    {
      const c = L.castleGate;
      const g = seg(c.a[0], c.a[1], c.b[0], c.b[1], { kind: 'gate', tag: c, e: 0.35, t: 6 });
      c.seg = g; this.segs.push(g);
    }
    for (const gt of L.gates || []) {
      const g = seg(gt.a[0], gt.a[1], gt.b[0], gt.b[1], { kind: 'oneway', e: 0.3, t: 2 });
      let nx = -g.uy, ny = g.ux;
      if (nx * gt.nx + ny * gt.ny < 0) { nx = -nx; ny = -ny; }
      g.oneWay = true; g.nx = nx; g.ny = ny;
      this.segs.push(g);
    }
    // plunger tip (moves)
    this.plungerSeg = seg(L.FIELD.laneIn, this.plunger.y, L.FIELD.laneOut, this.plunger.y, { kind: 'plunger', e: 0.2, t: 2 });
    this.segs.push(this.plungerSeg);

    for (const f of L.flippers) {
      this.flippers.push({ ...f, angle: f.rest, omega: 0, pressed: false, cfg: f });
    }
  }

  addBall(x, y, vx = 0, vy = 0) {
    const b = { x, y, vx, vy, mode: 'field', id: Math.random().toString(36).slice(2), h: 0, still: 0, rollX: 0, rollY: 0, lastHit: 0 };
    this.balls.push(b);
    return b;
  }
  removeBall(b) { this.balls = this.balls.filter((o) => o !== b); }

  setFlipper(side, pressed) { for (const f of this.flippers) if (f.side === side) f.pressed = pressed; }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this.substep(h);
    for (const b of this.balls) if (b.mode === 'rail') this.stepRail(b, dt);
  }

  substep(h) {
    // flippers
    for (const f of this.flippers) {
      const c = f.cfg;
      const dir = c.side === 'L' ? -1 : 1; // direction of "up" rotation
      const target = f.pressed ? c.up : c.rest;
      const speed = f.pressed ? 30 : 17;
      const prev = f.angle;
      let next = prev + Math.sign(target - prev) * speed * h;
      if ((target - prev) * (target - next) <= 0) next = target;
      f.omega = (next - prev) / h;
      f.angle = next;
      f.dir = dir;
    }
    // plunger
    const py = L.PLUNGER.y + R + this.plunger.pull * 12;
    this.plungerSeg.ay = this.plungerSeg.by = py;

    for (const b of this.balls) {
      if (b.mode !== 'field') continue;
      const px = b.x, py0 = b.y;
      b.vy += GRAVITY * h;
      // light rolling resistance
      const damp = 1 - 0.06 * h;
      b.vx *= damp; b.vy *= damp;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
      b.x += b.vx * h; b.y += b.vy * h;

      for (const g of this.segs) if (g.enabled) this.collideSeg(b, g);
      for (const c of this.circles) if (c.enabled) this.collideCircle(b, c);
      if (!b.outlane && L.inOutlane(b)) b.outlane = true;
      if (!b.outlane) for (const f of this.flippers) this.collideFlipper(b, f);

      // hard bounds (safety net against tunnelling)
      if (b.x < L.FIELD.left + R) { b.x = L.FIELD.left + R; if (b.vx < 0) b.vx = -b.vx * 0.4; }
      if (b.x > L.FIELD.right - R) { b.x = L.FIELD.right - R; if (b.vx > 0) b.vx = -b.vx * 0.4; }
      if (b.y < L.FIELD.top + R) { b.y = L.FIELD.top + R; if (b.vy < 0) b.vy = -b.vy * 0.4; }

      b.rollX += b.x - px; b.rollY += b.y - py0;
      this.handlers.onSubstep?.(b, px, py0, h);
    }
    // ball-ball
    const B = this.balls;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], c = B[j];
      if (a.mode !== 'field' || c.mode !== 'field') continue;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 2 * R) {
        const nx = dx / d, ny = dy / d, pen = 2 * R - d;
        a.x -= nx * pen / 2; a.y -= ny * pen / 2; c.x += nx * pen / 2; c.y += ny * pen / 2;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) {
          const j2 = -(1 + 0.9) * rv / 2;
          a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny;
          if (-rv > 120) this.handlers.onHit?.('ball', a, c, -rv);
        }
      }
    }
  }

  resolve(b, nx, ny, pen, e, f, svx = 0, svy = 0) {
    b.x += nx * pen; b.y += ny * pen;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    // low-speed contacts don't bounce (ball settles / rolls along)
    const ee = -vn < 70 ? 0 : e;
    const tx = rvx - vn * nx, ty = rvy - vn * ny;
    // Coulomb friction: tangential change bounded by the normal impulse (no drag while rolling along a wall)
    const tl = Math.hypot(tx, ty);
    const k = tl > 1e-6 ? Math.max(0, 1 - (f * 4 * -vn * (1 + ee)) / tl) : 1;
    const nrx = -ee * vn * nx + tx * k, nry = -ee * vn * ny + ty * k;
    b.vx = nrx + svx; b.vy = nry + svy;
    return -vn;
  }

  collideSeg(b, g) {
    const wx = b.x - g.ax, wy = b.y - g.ay;
    let t = (wx * g.ux + wy * g.uy);
    t = Math.max(0, Math.min(g.len, t));
    const qx = g.ax + g.ux * t, qy = g.ay + g.uy * t;
    let dx = b.x - qx, dy = b.y - qy;
    const d = Math.hypot(dx, dy);
    const rr = R + g.t;
    if (d >= rr) return;
    let nx, ny;
    if (g.oneWay) {
      const side = wx * g.nx + wy * g.ny;
      const vn = b.vx * g.nx + b.vy * g.ny;
      if (side < R * 0.2 || vn > 0) return; // from the back, or leaving: pass through
      nx = g.nx; ny = g.ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    } else if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = -g.uy; ny = g.ux; }
    const imp = this.resolve(b, nx, ny, rr - d, g.e, g.f);
    if (g.kind === 'sling' && imp > 40) {
      b.vx += g.knx * 1050; b.vy += g.kny * 1050;
      this.handlers.onHit?.('sling', b, g.tag, imp);
    } else if (imp > 25 && g.kind !== 'wall' && g.kind !== 'plunger' && g.kind !== 'oneway') {
      this.handlers.onHit?.(g.kind, b, g.tag, imp);
    } else if (imp > 160) {
      this.handlers.onHit?.('wall', b, g, imp);
    }
  }

  collideCircle(b, c) {
    const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy), rr = R + c.r;
    if (d >= rr || d < 1e-6) return;
    const nx = dx / d, ny = dy / d;
    const imp = this.resolve(b, nx, ny, rr - d, c.e, 0.02);
    if (c.kind === 'bumper') {
      // active pop bumper: guaranteed strong outward kick
      // kicks that would go straight up are steered sideways so the ball leaves the glade
      let kx = nx, ky = ny;
      if (ky < -0.55) { kx += (Math.abs(nx) > 0.05 ? Math.sign(nx) : Math.random() < 0.5 ? -1 : 1) * 0.9; const l = Math.hypot(kx, ky); kx /= l; ky /= l; }
      { const a = (Math.random() - 0.5) * 0.35, c = Math.cos(a), s2 = Math.sin(a); const rx = kx * c - ky * s2; ky = kx * s2 + ky * c; kx = rx; }
      const vn = b.vx * kx + b.vy * ky;
      const want = 980;
      if (vn < want) { b.vx += kx * (want - vn); b.vy += ky * (want - vn); }
      this.handlers.onHit?.('bumper', b, c.tag, Math.max(imp, 200));
    } else if (imp > (c.kind === 'shield' ? 25 : 80)) this.handlers.onHit?.(c.kind, b, c.tag || c, imp);
  }

  flipperGeom(f) {
    const c = f.cfg;
    return { px: c.x, py: c.y, tx: c.x + Math.cos(f.angle) * c.len, ty: c.y + Math.sin(f.angle) * c.len };
  }

  collideFlipper(b, f) {
    const c = f.cfg;
    const { px, py, tx, ty } = this.flipperGeom(f);
    const ux = (tx - px) / c.len, uy = (ty - py) / c.len;
    const wx = b.x - px, wy = b.y - py;
    let t = Math.max(0, Math.min(c.len, wx * ux + wy * uy));
    const qx = px + ux * t, qy = py + uy * t;
    const rad = c.r0 + (c.r1 - c.r0) * (t / c.len);
    const dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy), rr = R + rad;
    if (d >= rr || d < 1e-6) return;
    const nx = dx / d, ny = dy / d;
    // surface velocity at contact point
    const rx = b.x - nx * R - px, ry = b.y - ny * R - py;
    const svx = -f.omega * ry, svy = f.omega * rx;
    const imp = this.resolve(b, nx, ny, rr - d, 0.5, 0.03, svx, svy);
    if (imp > 60) this.handlers.onHit?.('flipper', b, f, imp);
  }

  // --- rails (ramps) -----------------------------------------------------------------
  enterRail(b, name, speed) {
    b.mode = 'rail';
    b.rail = this.rails[name];
    b.railName = name;
    b.s = 0;
    b.rv = Math.min(Math.max(speed, 700), 2600);
  }

  stepRail(b, dt) {
    const rail = b.rail;
    const p = rail.at(b.s);
    // gravity along the rail (heights in px, the ramp is steep), plus rolling drag
    b.rv -= GRAVITY * 0.55 * p.slope * dt;
    b.rv -= b.rv * 0.12 * dt;
    b.rv = Math.max(b.rv, 520);
    const prevX = b.x, prevY = b.y;
    b.s += b.rv * dt;
    const q = rail.at(b.s);
    b.x = q.x; b.y = q.y; b.h = q.h;
    b.rollX += b.x - prevX; b.rollY += b.y - prevY;
    if (b.s >= rail.length) {
      const ex = L.ramps[b.railName].exit;
      const k = Math.min(1.6, b.rv / 900);
      b.mode = 'field'; b.h = 0;
      b.vx = ex.vx * k; b.vy = ex.vy * k;
      this.handlers.onRailExit?.(b, b.railName);
    }
  }
}
