// Simulation: owns the physics world and the rules, runs at a fixed rate, pools all balls.
// Presentation code reads `sim.world.balls` / `sim.world.flippers` / `sim.rules` and listens on `sim.bus`.

import { EventBus } from './events.js';
import { buildTable } from './table.js';
import { PhysicsWorld } from './physics.js';
import { GameRules } from './rules.js';
import { STEP, PHYS, TIMING, MAX_BALLS, SKILL_TARGET, secToTicks } from './config.js';

const LAUNCH_CD = secToTicks(TIMING.LAUNCH_COOLDOWN);
const AUTO_TICKS = secToTicks(TIMING.MB_AUTOLAUNCH);
const STUCK_TICKS = secToTicks(PHYS.STUCK_TIME);

export class Simulation {
  constructor(bus = new EventBus()) {
    this.bus = bus;
    this.table = buildTable();
    this.world = new PhysicsWorld(this.table, MAX_BALLS);
    this.rules = new GameRules(bus, this);
    this.tick = 0;
    this.plunger = { pulling: false, power: 0, cooldown: 0, auto: 0, pos: 0 };
    this.skillTarget = this.table.circles.find((c) => c.id === SKILL_TARGET);
    this._contact = { kind: '', id: null, impact: 0, x: 0, y: 0 }; // reused payload (no per-hit allocation)
    this.world.onContact = (b, c, impact) => this._onContact(b, c, impact);
    this.world.onSensor = (b, s) => this._onSensor(b, s);
    this.setDoor(false);
  }

  // ================================================================ ctl interface used by GameRules
  resetTable() {
    for (const b of this.world.balls) this._release(b);
    this.plunger.pulling = false;
    this.plunger.power = 0;
    this.plunger.cooldown = 0;
    this.setDoor(false);
  }

  activeBallCount() { return this.world.activeBalls(); }

  setDoor(open) {
    this.world.setToggle('doorClosed', !open);
    this.world.setToggle('doorOpen', open);
  }

  serveBall() {
    const b = this._take();
    if (!b) return null;
    const [x, y] = this.table.points.plunger;
    this._place(b, x, y, 0, 0, 'held');
    this.bus.emit('ballSpawn', { id: b.id, where: 'plunger' });
    return b;
  }

  removeBall(b) {
    if (!b.active) return;
    this._release(b);
    this.bus.emit('ballRemoved', { id: b.id });
  }

  kickback(b) {
    const [x] = this.table.points.kickback;
    b.x = x;
    b.vx = 0;
    b.vy = PHYS.KICKBACK_SPEED;
    this.bus.emit('kickbackFire', { x: b.x, y: b.y });
  }

  ejectFromTower(b, delaySec) {
    b.mode = 'tower';
    b.timer = secToTicks(delaySec);
  }

  startMultiball(captured) {
    // the captured ball waits inside the tower and comes back a moment later
    this.ejectFromTower(captured, TIMING.MB_ORIGINAL_EJECT);
    const P = this.table.points;
    // three new balls hit the table at the same instant from three different places
    const spawns = [
      [P.towerEject[0], P.towerEject[1], -3.5, -13, 'tower'],
      [P.shooterAuto[0], P.shooterAuto[1], 0, PHYS.PLUNGER_MAX - 2, 'shooter'],
      [P.portal[0], P.portal[1], 0, -8, 'portal'],
    ];
    for (const [x, y, vx, vy, where] of spawns) {
      const b = this._take();
      if (!b) break;
      this._place(b, x, y, vx, vy, 'free');
      this.bus.emit('ballSpawn', { id: b.id, where });
    }
  }

  /** Multiball timer ran out: keep exactly one ball (the safest free one), dissolve all the others. */
  removeExtraBalls() {
    let keep = null;
    for (const b of this.world.balls) {
      if (!b.active) continue;
      if (b.mode === 'free' && (!keep || keep.mode !== 'free' || b.y > keep.y)) keep = b;
      else if (!keep) keep = b;
    }
    for (const b of this.world.balls) {
      if (!b.active || b === keep) continue;
      this.bus.emit('ballDissolve', { id: b.id, x: b.x, y: b.y, z: b.z, visible: b.mode !== 'tower' });
      this.removeBall(b);
    }
  }

  // ================================================================ input
  setFlipper(side, pressed) {
    if (this.rules.state !== 'playing') return;
    const f = this.world.flippers.find((fl) => fl.side === side);
    if (!f || f.pressed === pressed) return;
    this.world.setFlipper(side, pressed);
    this.bus.emit('flipper', { side, pressed });
  }

  heldBall() {
    for (const b of this.world.balls) if (b.active && b.mode === 'held') return b;
    return null;
  }

  canLaunch() {
    return this.rules.state === 'playing' && !this.rules.multiball && !!this.heldBall() && this.plunger.cooldown === 0;
  }

  pressLaunch() {
    if (!this.canLaunch() || this.plunger.pulling) return false;
    this.plunger.pulling = true;
    this.plunger.power = 0;
    this.bus.emit('plungerPull', {});
    return true;
  }

  releaseLaunch() {
    if (!this.plunger.pulling) return false;
    this.plunger.pulling = false;
    const b = this.heldBall();
    if (!b) return false;
    this._launch(b, this.plunger.power, true);
    return true;
  }

  /** Abort a pull without launching (pause, app switch). */
  cancelLaunch() {
    this.plunger.pulling = false;
    this.plunger.power = 0;
  }

  _launch(b, power, manual) {
    const armed = manual ? this.rules.onLaunch() : false;
    if (armed) power = Math.max(power, 0.85);
    power = Math.max(0.25, Math.min(1, power));
    b.mode = 'free';
    b.vx = 0;
    b.vy = PHYS.PLUNGER_MIN + (PHYS.PLUNGER_MAX - PHYS.PLUNGER_MIN) * power;
    b.still = 0;
    this.plunger.power = 0;
    this.plunger.cooldown = LAUNCH_CD;
    this.bus.emit('launch', { power, armed, auto: !manual });
  }

  // ================================================================ stepping
  step() {
    this.tick++;
    const rules = this.rules;
    rules.update();

    const pl = this.plunger;
    if (pl.cooldown > 0) pl.cooldown--;
    if (pl.pulling) pl.power = Math.min(1, pl.power + STEP / TIMING.PLUNGER_FULL);
    pl.pos += ((pl.pulling ? pl.power : 0) - pl.pos) * (pl.pulling ? 0.5 : 0.6);

    this.world.step(STEP);

    const balls = this.world.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.active) continue;
      if (b.mode === 'rail') this._updateRail(b);
      else if (b.mode === 'tower') this._updateTower(b);
      else if (b.mode === 'held') {
        if (rules.multiball && pl.cooldown === 0 && ++pl.auto >= AUTO_TICKS) { pl.auto = 0; this._launch(b, 1, false); }
      } else if (b.mode === 'free') this._checkFree(b);
    }
  }

  _checkFree(b) {
    // lost down the drain
    if (b.y < -1.5) { this.rules.onDrain(b); return; }
    // safety net: anything that ever escapes the cabinet (should never happen) is put back
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.x > 21 || b.y > 40.5) {
      this._rescue(b);
      return;
    }
    const speed = Math.hypot(b.vx, b.vy);
    // settled at the bottom of the shooter lane -> back onto the plunger
    if (b.x > 19.2 && b.y < 2.2 && speed < 2.5) {
      const [x, y] = this.table.points.plunger;
      this._place(b, x, y, 0, 0, 'held');
      this.plunger.auto = 0;
      this.rules.onBallHeld();
      this.bus.emit('ballHeld', { id: b.id });
      return;
    }
    // stuck-ball detection (a ball cradled on a flipper by the player is not stuck)
    if (speed < PHYS.STUCK_SPEED && !this._nearFlipper(b)) {
      if (++b.still >= STUCK_TICKS) {
        b.still = 0;
        const moved = Math.hypot(b.x - b.anchorX, b.y - b.anchorY);
        b.nudges = moved < 1 ? b.nudges + 1 : 1;
        b.anchorX = b.x; b.anchorY = b.y;
        if (b.nudges >= 3) { this._rescue(b); return; }
        b.vx = (b.x < 10.5 ? 1 : -1) * 9;
        b.vy = 14;
        this.bus.emit('ballNudge', { id: b.id, x: b.x, y: b.y });
      }
    } else {
      b.still = 0;
    }
  }

  _nearFlipper(b) {
    for (const f of this.world.flippers) {
      const dx = f.tx - f.px, dy = f.ty - f.py;
      let t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / (dx * dx + dy * dy);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(b.x - (f.px + t * dx), b.y - (f.py + t * dy)) < 1.5) return true;
    }
    return false;
  }

  _rescue(b) {
    const [x, y] = this.table.points.rescue;
    this._place(b, x, y, 0, -6, 'free');
    b.nudges = 0;
    this.bus.emit('ballRescue', { id: b.id });
  }

  _enterRail(b, id) {
    const ramp = this.table.ramps[id];
    b.mode = 'rail';
    b.rail = ramp;
    b.railId = id;
    b.railS = 0;
    b.railI = 0;
    b.railV = Math.max(20, Math.min(34, Math.hypot(b.vx, b.vy)));
    this.bus.emit('railEnter', { id });
  }

  _updateRail(b) {
    const { pts, cum, length } = b.rail.path;
    let i = b.railI;
    // slope of the rail at the ball: uphill slows it, downhill speeds it up
    const j = Math.min(i + 1, pts.length - 1);
    const seg = cum[j] - cum[i] || 1;
    const slope = (pts[j][2] - pts[i][2]) / seg;
    b.railV = Math.max(13, Math.min(38, b.railV - 30 * slope * STEP));
    b.railS += b.railV * STEP;
    if (b.railS >= length) {
      const end = pts[pts.length - 1];
      const [vx, vy] = b.rail.exitVel;
      const id = b.railId;
      this._place(b, end[0], end[1], vx, vy, 'free');
      this.bus.emit('railExit', { id, x: end[0], y: end[1] });
      this.rules.onRamp(id);
      return;
    }
    while (i < cum.length - 2 && cum[i + 1] < b.railS) i++;
    b.railI = i;
    const a = pts[i], c = pts[i + 1];
    const t = (b.railS - cum[i]) / (cum[i + 1] - cum[i] || 1);
    b.x = a[0] + (c[0] - a[0]) * t;
    b.y = a[1] + (c[1] - a[1]) * t;
    b.z = a[2] + (c[2] - a[2]) * t;
    b.rollX += b.railV * STEP;
  }

  _updateTower(b) {
    if (b.timer > 0) { b.timer--; return; }
    const [x, y] = this.table.points.towerEject;
    // wait until the doorway is clear
    for (const o of this.world.balls) {
      if (o !== b && o.active && o.mode === 'free' && Math.hypot(o.x - x, o.y - y) < 1.3) { b.timer = 12; return; }
    }
    this._place(b, x, y, (Math.random() - 0.5) * 6, -12, 'free');
    this.bus.emit('towerEject', { id: b.id, x, y });
  }

  // ================================================================ physics callbacks
  _onContact(b, c, impact) {
    const r = this.rules;
    switch (c.kind) {
      case 'flipper':
        if (impact > 2) r.onFlipperHit(b);
        break;
      case 'element':
        if (impact > 0.4) r.onElementHit(c.id, b.x, b.y);
        break;
      case 'wizard':
        if (impact > 1) r.onWizardHit(b.x, b.y);
        break;
      case 'door':
        if (impact > 1) r.onDoorHit(b.x, b.y);
        break;
      default:
        break;
    }
    if (impact > 2.5) {
      const ev = this._contact;
      ev.kind = c.kind; ev.id = c.id || null; ev.impact = impact; ev.x = b.x; ev.y = b.y;
      this.bus.emit('contact', ev);
    }
  }

  _onSensor(b, s) {
    const r = this.rules;
    switch (s.id) {
      case 'shooterExit':
        if (b.vy > 0 && r.onShooterExit()) {
          const t = this.skillTarget;
          const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy);
          b.vx = (dx / d) * 30;
          b.vy = (dy / d) * 30;
        }
        break;
      case 'rampA':
      case 'rampB':
        if (b.vy > 0) this._enterRail(b, s.id);
        break;
      case 'orbitL': r.onOrbit(b, 'L', b.vy); break;
      case 'orbitR': r.onOrbit(b, 'R', b.vy); break;
      case 'towerIn':
        b.mode = 'tower';
        b.timer = 0;
        b.vx = b.vy = 0;
        this.bus.emit('towerCapture', { id: b.id });
        r.onTowerEnter(b);
        break;
      case 'outlaneL': r.onOutlane(b, 'L'); break;
      case 'outlaneR': r.onOutlane(b, 'R'); break;
      case 'inlaneL': case 'inlaneR': this.bus.emit('inlane', { side: s.id.slice(-1) }); break;
      case 'pool': this.bus.emit('poolSplash', { x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) }); break;
      default: break;
    }
  }

  // ================================================================ pool helpers
  _take() {
    for (const b of this.world.balls) if (!b.active) return b;
    return null;
  }

  _place(b, x, y, vx, vy, mode) {
    b.active = true;
    b.mode = mode;
    b.x = b.px = b.anchorX = x;
    b.y = b.py = b.anchorY = y;
    b.z = b.pz = 0;
    b.vx = vx; b.vy = vy;
    b.sensorMask = 0;
    b.still = 0;
    b.nudges = 0;
    b.rail = null;
    b.timer = 0;
  }

  _release(b) {
    b.active = false;
    b.mode = 'off';
    b.sensorMask = 0;
    b.rail = null;
    b.timer = 0;
  }
}
