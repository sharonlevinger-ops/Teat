// DOM HUD. Updates only what changed (no layout thrash, no per-frame string building when idle).
import { STAGES, TIMING, HZ } from '../core/config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class Hud {
  constructor(sim, renderer) {
    this.sim = sim;
    this.renderer = renderer;
    this.el = {
      score: $('hud-score'), ball: $('hud-ball'), mult: $('hud-mult'), guests: $('hud-guests'), mode: $('hud-mode'),
      combo: [...document.querySelectorAll('#hud-combo i')], banner: $('banner'), popups: $('popups'),
      launch: $('launch-hint'), meter: $('plunger-meter'), meterFill: document.querySelector('#plunger-meter .fill'), fps: $('fps'),
    };
    this.last = {};
    this.displayScore = 0;
    this.bannerQueue = [];
    this.bannerBusy = 0;
    // pooled pop-up elements (no DOM creation while playing)
    this.popPool = [];
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('div');
      d.className = 'popup';
      this.el.popups.appendChild(d);
      this.popPool.push(d);
    }
    this.popIndex = 0;
    this.showFps = false;
    this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0;
  }

  bind(bus) {
    bus.on('score', (p) => {
      if (p.x !== null && (p.points >= 100 || p.reason === 'skillShot')) this.popup(p.x, p.y, '+' + fmt(p.points), p.points >= 5000);
      if (p.points >= 1000) this._bump();
    });
    bus.on('stage', ({ index, initial }) => {
      document.body.dataset.chapter = String(index + 1);
      if (!initial) this.banner(STAGES[index].title.replace(': ', ':<br>'), true);
    });
    bus.on('rushStart', () => this.banner('RUSH COMBO!<small>X2 SCORING · 30s</small>', true));
    bus.on('rushEnd', () => {});
    bus.on('doorOpen', () => this.banner('THE TOWER OPENS!<small>SHOOT THE DOOR · 20s</small>', true));
    bus.on('towerEnter', () => this.banner("WIZARD'S TOWER<br>MULTIBALL!<small>+15,000</small>", true));
    bus.on('superJackpot', () => this.banner('SUPER JACKPOT!', true));
    bus.on('skillShot', () => this.banner('SKILL SHOT!<small>+5,000</small>'));
    bus.on('kickbackFire', () => this.banner('KICKBACK!'));
    bus.on('multiballEnd', ({ reason }) => this.banner(reason === 'timeout' ? 'MULTIBALL COMPLETE' : 'MULTIBALL OVER'));
    bus.on('ballLost', ({ nextBall }) => this.banner(`BALL ${nextBall}`));
    bus.on('ballRescue', () => this.banner('<small>MAGIC RESCUE</small>'));
    bus.on('loop', () => this.banner('<small>LOOP +500</small>'));
  }

  /** priority banners (chapter, multiball, jackpots) interrupt whatever is showing */
  banner(html, priority = false) {
    if (priority) { this.bannerQueue = this.bannerQueue.filter((b) => b.p); this.bannerQueue.unshift({ html, p: true }); this.bannerBusy = Math.min(this.bannerBusy, 0); }
    else this.bannerQueue.push({ html, p: false });
    if (this.bannerQueue.length > 3) this.bannerQueue.length = 3;
  }

  popup(x, y, text, big) {
    const d = this.popPool[this.popIndex++ % this.popPool.length];
    const p = this.renderer.project(x, y, 1.5);
    d.textContent = text;
    d.classList.toggle('big', !!big);
    d.style.setProperty('--x', `${Math.round(p.x - 20)}px`);
    d.style.setProperty('--y', `${Math.round(p.y - 10)}px`);
    d.classList.remove('live');
    void d.offsetWidth; // restart animation
    d.classList.add('live');
  }

  _bump() {
    const s = this.el.score;
    s.classList.remove('bump');
    void s.offsetWidth;
    s.classList.add('bump');
  }

  _set(key, el, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el[prop] = value;
  }

  update(dt) {
    const r = this.sim.rules;
    // score counts up smoothly
    const target = r.score;
    if (this.displayScore < target) this.displayScore = Math.min(target, this.displayScore + Math.max(10, (target - this.displayScore) * Math.min(1, dt * 10)));
    else this.displayScore = target;
    this._set('score', this.el.score, String(Math.floor(this.displayScore)).padStart(6, '0'));
    this._set('ball', this.el.ball, String(r.ball));
    this._set('mult', this.el.mult, r.stage.mult.toFixed(1) + 'X');
    this._set('guests', this.el.guests, String(r.guests));

    let mode = '', rush = false;
    if (r.state === 'playing') {
      if (r.rushActive) { mode = `RUSH COMBO! X2 · ${Math.ceil(r.rushTicks / HZ)}`; rush = true; }
      else if (r.multiball) mode = `MULTIBALL · ${Math.ceil(r.mbTicks / HZ)}`;
      else if (r.doorOpen) mode = `TOWER OPEN · ${Math.ceil(r.doorTicks / HZ)}`;
      else if (r.wizardCharge > 0) mode = `WIZARD ${'✦'.repeat(r.wizardCharge)}${'·'.repeat(3 - r.wizardCharge)}`;
      if (r.multiball && r.rushActive) mode = `RUSH X2 ${Math.ceil(r.rushTicks / HZ)} · MB ${Math.ceil(r.mbTicks / HZ)}`;
    }
    this._set('mode', this.el.mode, mode);
    if (this.last.rush !== rush) { this.last.rush = rush; this.el.mode.classList.toggle('rush', rush); }

    const comboKey = r.rushActive ? 'all' : [...r.combo].join();
    if (this.last.combo !== comboKey) {
      this.last.combo = comboKey;
      for (const i of this.el.combo) i.classList.toggle('on', r.rushActive || r.combo.has(i.dataset.id));
    }

    // launch hint + plunger meter
    const held = this.sim.heldBall();
    const canLaunch = r.state === 'playing' && held && !r.multiball;
    this._toggle('launch', this.el.launch, canLaunch && !this.sim.plunger.pulling);
    this._toggle('meter', this.el.meter, canLaunch && this.sim.plunger.pulling);
    if (this.sim.plunger.pulling) {
      this.el.meterFill.style.height = `${Math.round(this.sim.plunger.power * 112)}px`;
      const lit = r.skillLit;
      if (this.last.skill !== lit) { this.last.skill = lit; this.el.meter.classList.toggle('skill', lit); }
    }

    // banners
    if (this.bannerBusy > 0) this.bannerBusy -= dt;
    else if (this.bannerQueue.length) {
      const { html } = this.bannerQueue.shift();
      const b = this.el.banner;
      b.innerHTML = html;
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
      this.bannerBusy = 1.6;
    }

    if (this.showFps) {
      this._fpsAcc += dt; this._fpsN++;
      if ((this._fpsT += dt) > 0.5) {
        this.el.fps.textContent = `${Math.round(this._fpsN / this._fpsAcc)} fps · x${this.renderer.pixelRatio.toFixed(2)} · ${this.sim.world.lastSubsteps} sub`;
        this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0;
      }
    }
  }

  _toggle(key, el, on) {
    if (this.last[key] === on) return;
    this.last[key] = on;
    el.classList.toggle('hidden', !on);
  }

  setFps(on) { this.showFps = on; this.el.fps.classList.toggle('hidden', !on); }
  resetScore() { this.displayScore = 0; }
}

export { TIMING };
