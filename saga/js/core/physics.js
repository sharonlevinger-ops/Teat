// 2D pinball physics with continuous collision detection.
//
// Anti-tunnelling strategy: every fixed step is split into adaptive sub-steps so that no ball (and no
// flipper tip) moves more than PHYS.MAX_MOVE_FRACTION · r per sub-step. A ball can therefore never cross a
// zero-thickness wall or a flipper between two collision checks, regardless of speed.
// The hot loop uses plain numbers only (no per-step allocations → no GC spikes).

import { PHYS } from './config.js';

const R = PHYS.BALL_R;

export class PhysicsWorld {
  constructor(table, maxBalls = 4) {
    this.segs = [];
    this.circles = [];
    this.sensors = [];
    this.flippers = [];
    this.toggles = Object.create(null); // name -> enabled (e.g. 'door')
    this.gravity = PHYS.GRAVITY;
    this.onContact = null; // (ball, collider, impactSpeed)
    this.onSensor = null; // (ball, sensor)
    this.lastSubsteps = 1;
    this.seed = 12345; // deterministic PRNG for kicker variation (reproducible tests)

    for (const w of table.walls) {
      for (let i = 0; i < w.pts.length - 1; i++) {
        const [ax, ay] = w.pts[i];
        const [bx, by] = w.pts[i + 1];
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        this.segs.push({
          ax, ay, bx, by, dx, dy, len2: len * len,
          nx: -dy / len, ny: dx / len, // left normal (used by one-way gates)
          minx: Math.min(ax, bx) - R, maxx: Math.max(ax, bx) + R,
          miny: Math.min(ay, by) - R, maxy: Math.max(ay, by) + R,
          kind: w.kind, id: w.id || null, e: w.e, fr: w.fr, kick: w.kick || null,
          oneWay: !!w.oneWay, toggle: w.toggle || null,
        });
      }
    }
    for (const c of table.circles) this.circles.push({ ...c, toggle: c.toggle || null });
    for (const s of table.sensors) this.sensors.push({ ...s, toggle: s.toggle || null });
    if (this.sensors.length > 30) throw new Error('too many sensors for the bitmask');
    for (const f of table.flippers) {
      this.flippers.push({
        ...f, kind: 'flipper', angle: f.rest, prevAngle: f.rest, omega: 0, pressed: false,
        dir: Math.sign(f.up - f.rest), tx: 0, ty: 0,
      });
    }
    for (const f of this.flippers) this._flipperTip(f);

    this.balls = [];
    for (let i = 0; i < maxBalls; i++) {
      this.balls.push({
        id: i, active: false, mode: 'off', // off | free | held | rail | tower
        x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, z: 0, pz: 0,
        sensorMask: 0, still: 0, nudges: 0, anchorX: 0, anchorY: 0,
        rail: null, railS: 0, railV: 0, timer: 0, tag: null, spin: 0, rollX: 0, rollY: 0,
        lastFlipperScore: -1, fade: 0,
      });
    }
  }

  setToggle(name, on) { this.toggles[name] = !!on; }
  isOn(toggle) { return !toggle || this.toggles[toggle] !== false; }

  _flipperTip(f) {
    f.tx = f.px + Math.cos(f.angle) * f.len;
    f.ty = f.py + Math.sin(f.angle) * f.len;
  }

  setFlipper(side, pressed) {
    for (const f of this.flippers) if (f.side === side) f.pressed = pressed;
  }

  activeBalls() {
    let n = 0;
    for (const b of this.balls) if (b.active) n++;
    return n;
  }

  /** Advance the world by dt (normally the fixed STEP). */
  step(dt) {
    let maxV = 0;
    for (const b of this.balls) {
      b.px = b.x; b.py = b.y; b.pz = b.z;
      if (b.active && b.mode === 'free') {
        const v = Math.hypot(b.vx, b.vy);
        if (v > maxV) maxV = v;
      }
    }
    let maxTip = 0;
    for (const f of this.flippers) {
      const target = f.pressed ? f.up : f.rest;
      if (Math.abs(target - f.angle) > 1e-6) maxTip = Math.max(maxTip, PHYS.FLIPPER_UP_SPEED * f.len);
    }
    const travel = (maxV + this.gravity * dt + maxTip) * dt;
    const n = Math.min(PHYS.MAX_SUBSTEPS, Math.max(1, Math.ceil(travel / (PHYS.MAX_MOVE_FRACTION * R))));
    this.lastSubsteps = n;
    const h = dt / n;
    for (let i = 0; i < n; i++) this._substep(h);
  }

  _substep(h) {
    // flippers (kinematic)
    for (const f of this.flippers) {
      const target = f.pressed ? f.up : f.rest;
      const speed = f.pressed ? PHYS.FLIPPER_UP_SPEED : PHYS.FLIPPER_DOWN_SPEED;
      const old = f.angle;
      const diff = target - f.angle;
      const stepA = speed * h;
      f.angle = Math.abs(diff) <= stepA ? target : f.angle + Math.sign(diff) * stepA;
      f.omega = (f.angle - old) / h;
      this._flipperTip(f);
    }

    const damp = 1 - PHYS.LINEAR_DAMP * h;
    const balls = this.balls;
    for (let bi = 0; bi < balls.length; bi++) {
      const b = balls[bi];
      if (!b.active || b.mode !== 'free') continue;
      b.vy -= this.gravity * h;
      b.vx *= damp; b.vy *= damp;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > PHYS.MAX_SPEED * PHYS.MAX_SPEED) {
        const k = PHYS.MAX_SPEED / Math.sqrt(sp2);
        b.vx *= k; b.vy *= k;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.rollX += b.vx * h; b.rollY += b.vy * h;

      // two passes resolve pinches (ball squeezed between a moving flipper and a wall)
      for (let pass = 0; pass < 2; pass++) {
        this._collideSegments(b);
        this._collideCircles(b);
        this._collideFlippers(b);
      }
    }

    // ball-ball
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active || a.mode !== 'free') continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (!c.active || c.mode !== 'free') continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const pen = (2 * R - d) / 2;
        a.x -= nx * pen; a.y -= ny * pen;
        c.x += nx * pen; c.y += ny * pen;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) {
          const j2 = (-(1 + 0.9) * rel) / 2;
          a.vx -= j2 * nx; a.vy -= j2 * ny;
          c.vx += j2 * nx; c.vy += j2 * ny;
          if (this.onContact) this.onContact(a, BALL_COLLIDER, -rel);
        }
      }
    }

    // sensors
    if (this.onSensor) {
      for (const b of balls) {
        if (!b.active || b.mode !== 'free') continue;
        let mask = 0;
        for (let s = 0; s < this.sensors.length; s++) {
          const sn = this.sensors[s];
          if (sn.toggle && !this.isOn(sn.toggle)) continue;
          let inside;
          if (sn.type === 'rect') inside = Math.abs(b.x - sn.x) <= sn.w / 2 && Math.abs(b.y - sn.y) <= sn.h / 2;
          else inside = (b.x - sn.x) ** 2 + (b.y - sn.y) ** 2 <= sn.r * sn.r;
          if (inside) {
            mask |= 1 << s;
            if (!(b.sensorMask & (1 << s))) {
              b.sensorMask |= 1 << s;
              this.onSensor(b, sn);
              if (!b.active || b.mode !== 'free') break; // the handler captured / removed the ball
            }
          }
        }
        if (b.active && b.mode === 'free') b.sensorMask = mask;
      }
    }
  }

  _bounce(b, nx, ny, e, fr, surfVx, surfVy, collider, kick, point = false) {
    const rvx = b.vx - surfVx, rvy = b.vy - surfVy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const impact = -vn;
    const tx = -ny, ty = nx;
    const vt = rvx * tx + rvy * ty;
    let vnOut = impact < PHYS.REST_SPEED ? 0 : impact * e;
    let vtOut = vt * (1 - fr);
    // a ball can't balance on the tip of a post or a wall corner: break the unstable equilibrium
    if (point && ny > 0.97 && Math.abs(vtOut) < 0.5) vtOut += this._rand() < 0.5 ? -0.8 : 0.8;
    // active kickers vary a little in strength and direction, like real solenoids (also breaks
    // perfectly periodic sling-to-sling ping-pong)
    if (kick === 'bumper') {
      vnOut = Math.max(vnOut, PHYS.BUMPER_KICK * (0.85 + 0.3 * this._rand()));
      vtOut += (this._rand() - 0.5) * 4;
    } else if (kick === 'sling' && impact > PHYS.SLING_MIN_IMPACT) {
      vnOut = Math.max(vnOut * 0.6, PHYS.SLING_KICK * (0.75 + 0.4 * this._rand()));
      vtOut += (this._rand() - 0.5) * 6;
    }
    b.vx = vnOut * nx + vtOut * tx + surfVx;
    b.vy = vnOut * ny + vtOut * ty + surfVy;
    if (this.onContact) this.onContact(b, collider, impact);
    return impact;
  }

  _rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  _collideSegments(b) {
    const segs = this.segs;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (b.x < s.minx || b.x > s.maxx || b.y < s.miny || b.y > s.maxy) continue;
      if (s.toggle && !this.isOn(s.toggle)) continue;
      let t = ((b.x - s.ax) * s.dx + (b.y - s.ay) * s.dy) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = s.ax + t * s.dx, cy = s.ay + t * s.dy;
      let ddx = b.x - cx, ddy = b.y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= R * R) continue;
      if (s.oneWay) {
        // collide only when the ball is on the normal side and moving against it
        const side = (b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny;
        if (side < 0 || b.vx * s.nx + b.vy * s.ny > 0) continue;
      }
      let d = Math.sqrt(d2);
      if (d < 1e-6) { ddx = s.nx; ddy = s.ny; d = 1; }
      const nx = ddx / d, ny = ddy / d;
      const pen = R - d;
      b.x += nx * pen; b.y += ny * pen;
      this._bounce(b, nx, ny, s.e, s.fr, 0, 0, s, s.kick, t === 0 || t === 1);
    }
  }

  _collideCircles(b) {
    const cs = this.circles;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.toggle && !this.isOn(c.toggle)) continue;
      const dx = b.x - c.x, dy = b.y - c.y;
      const rr = c.r + R;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      let nx, ny;
      if (d < 1e-6) { nx = 0; ny = 1; d = 0; } else { nx = dx / d; ny = dy / d; }
      b.x = c.x + nx * rr; b.y = c.y + ny * rr;
      this._bounce(b, nx, ny, c.e, 0.02, 0, 0, c, c.kick, true);
    }
  }

  _collideFlippers(b) {
    for (let i = 0; i < this.flippers.length; i++) {
      const f = this.flippers[i];
      const dx = f.tx - f.px, dy = f.ty - f.py;
      const len2 = dx * dx + dy * dy;
      let t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = f.px + t * dx, cy = f.py + t * dy;
      const rr = f.r1 + (f.r2 - f.r1) * t;
      let ddx = b.x - cx, ddy = b.y - cy;
      const lim = rr + R;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= lim * lim) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) { ddx = -dy; ddy = dx; d = Math.sqrt(len2); }
      const nx = ddx / d, ny = ddy / d;
      b.x = cx + nx * lim; b.y = cy + ny * lim;
      // surface velocity of the rotating flipper at the contact point
      const qx = cx + nx * rr - f.px, qy = cy + ny * rr - f.py;
      const svx = -f.omega * qy, svy = f.omega * qx;
      this._bounce(b, nx, ny, 0.3, 0.02, svx, svy, f, null);
    }
  }
}

export const BALL_COLLIDER = Object.freeze({ kind: 'ball', id: 'ball' });
