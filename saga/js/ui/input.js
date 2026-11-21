// Touch + keyboard input. Left half = left flipper, right half = right flipper,
// bottom-right corner = plunger (only while a ball waits on it). Full multi-touch.

const UI_SEL = 'button, input, label, textarea, .card, .tune-card, .overlay, .tune';
const SWIPE_PX = 45, SWIPE_MS = 320; // a quick upward swipe nudges the table

export class Input {
  constructor(target, sim, { onAnyTap = () => {}, isBlocked = () => false, isPlungerZone = () => false } = {}) {
    this.isPlungerZone = isPlungerZone;
    this.sim = sim;
    this.onAnyTap = onAnyTap;
    this.isBlocked = isBlocked;
    this.touches = new Map(); // id -> 'L' | 'R' | 'P'
    this.keys = { L: 0, R: 0 };
    this.swipes = new Map(); // id -> where/when the touch started (swipe-up nudge)

    const opts = { passive: false };
    target.addEventListener('touchstart', (e) => this._start(e), opts);
    target.addEventListener('touchend', (e) => this._end(e), opts);
    target.addEventListener('touchcancel', (e) => this._end(e), opts);
    target.addEventListener('touchmove', (e) => { if (!(e.target.closest && e.target.closest(UI_SEL))) { e.preventDefault(); this._move(e); } }, opts);
    // mouse (desktop testing)
    target.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || (e.target.closest && e.target.closest(UI_SEL))) return;
      this._press('mouse', e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => this._release('mouse'));
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  zoneFor(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    // the launch area only: the painted plunger and its TOUCH TO LAUNCH hint
    if (this.sim.canLaunch() && this.isPlungerZone(x, y)) return 'P';
    return x < w / 2 ? 'L' : 'R';
  }

  _start(e) {
    if (e.target.closest && e.target.closest(UI_SEL)) return; // let UI controls work
    e.preventDefault();
    for (const t of e.changedTouches) {
      this.swipes.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), used: false });
      this._press(t.identifier, t.clientX, t.clientY);
    }
  }

  /** quick upward swipe = nudge; its sideways part picks the direction */
  _move(e) {
    if (this.isBlocked()) return;
    for (const t of e.changedTouches) {
      const s = this.swipes.get(t.identifier);
      if (!s || s.used || this.touches.get(t.identifier) === 'P') continue; // pulling the plunger is not a nudge
      const dy = s.y - t.clientY, dx = t.clientX - s.x;
      if (performance.now() - s.t > SWIPE_MS) { s.used = true; continue; }
      if (dy > SWIPE_PX && dy > Math.abs(dx)) {
        s.used = true;
        this.sim.nudge(Math.abs(dx) > dy * 0.35 ? Math.sign(dx) : 0);
      }
    }
  }

  _end(e) {
    if (e.cancelable && !(e.target.closest && e.target.closest(UI_SEL))) e.preventDefault();
    for (const t of e.changedTouches) { this.swipes.delete(t.identifier); this._release(t.identifier); }
  }

  _press(id, x, y) {
    if (this.onAnyTap(x, y)) return; // consumed (e.g. title screen tap)
    if (this.isBlocked()) return;
    const zone = this.zoneFor(x, y);
    this.touches.set(id, zone);
    if (zone === 'P') this.sim.pressLaunch();
    else this._updateFlippers();
  }

  _release(id) {
    const zone = this.touches.get(id);
    if (zone === undefined) return;
    this.touches.delete(id);
    if (zone === 'P') {
      if (![...this.touches.values()].includes('P')) this.sim.releaseLaunch();
    } else this._updateFlippers();
  }

  _key(e, down) {
    if (e.target && e.target.closest && e.target.closest(UI_SEL)) return; // keys on a focused button/slider belong to it
    const k = e.code;
    let side = null;
    if (k === 'ArrowLeft' || k === 'KeyZ' || k === 'ShiftLeft') side = 'L';
    else if (k === 'ArrowRight' || k === 'Slash' || k === 'KeyM' || k === 'ShiftRight') side = 'R';
    if (side) {
      e.preventDefault();
      if (e.repeat) return;
      if (down && this.onAnyTap(-1, -1)) return;
      if (down && this.isBlocked()) return;
      this.keys[side] = down ? 1 : 0;
      this._updateFlippers();
      return;
    }
    if (k === 'KeyT' || k === 'ArrowUp') { // nudge (desktop)
      e.preventDefault();
      if (down && !e.repeat && !this.isBlocked()) this.sim.nudge(0);
      return;
    }
    if (k === 'Space' || k === 'Enter' || k === 'ArrowDown') {
      e.preventDefault();
      if (e.repeat) return;
      if (down) {
        if (this.onAnyTap(-1, -1) || this.isBlocked()) return;
        this.sim.pressLaunch();
      } else this.sim.releaseLaunch();
    }
  }

  _updateFlippers() {
    let L = this.keys.L > 0, R = this.keys.R > 0;
    for (const z of this.touches.values()) { if (z === 'L') L = true; else if (z === 'R') R = true; }
    this.sim.setFlipper('L', L);
    this.sim.setFlipper('R', R);
  }

  releaseAll() {
    this.touches.clear();
    this.keys.L = this.keys.R = 0;
    this.sim.setFlipper('L', false);
    this.sim.setFlipper('R', false);
    this.sim.cancelLaunch();
  }
}
