// Hidden designer tuning panel (not a player option). Opens with #tune in the address, or by holding the
// "Paused" title for 1.2 s. Sliders change the physics live; values are kept on this device and can be
// copied out as JSON, so the chosen numbers can be written into config.js.
import { PHYS, PHYS_DEFAULTS } from '../core/config.js';

export const TUNABLE = [
  ['TIME_SCALE', 'Game speed', 0.5, 1.1, 0.01],
  ['GRAVITY', 'Gravity', 30, 75, 1],
  ['FLIPPER_UP_SPEED', 'Flipper power', 16, 36, 0.5],
  ['SLING_KICK', 'Slingshot kick', 15, 45, 1],
  ['BUMPER_KICK', 'Mushroom kick', 15, 40, 1],
  ['KICKBACK_SPEED', 'Kickback', 35, 70, 1],
  ['PLUNGER_MAX', 'Plunger max', 55, 90, 1],
  ['LINEAR_DAMP', 'Rolling drag', 0, 0.3, 0.01],
];
const KEY = 'saga.tune';

/** Apply a saved/loaded set of values (unknown keys and out-of-range numbers are ignored). */
export function applyTune(values, world) {
  for (const [k, , min, max] of TUNABLE) {
    const v = values && values[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) PHYS[k] = v;
  }
  if (world) world.gravity = PHYS.GRAVITY;
}

export function currentTune() {
  const o = {};
  for (const [k] of TUNABLE) o[k] = PHYS[k];
  return o;
}

export function loadSavedTune(world) {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) applyTune(v, world); } catch { /* storage blocked */ }
}

export class TuningPanel {
  constructor(world) {
    this.world = world;
    const el = document.createElement('section');
    el.className = 'tune hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Tuning');
    el.innerHTML = `<div class="tune-card"><h3>Tuning <small>designer only</small></h3>
      ${TUNABLE.map(([k, label, min, max, step]) => `<label><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"><output data-o="${k}"></output></label>`).join('')}
      <div class="tune-row"><button class="gold-btn small" data-a="copy">Copy values</button><button class="gold-btn ghost small" data-a="reset">Defaults</button><button class="gold-btn ghost small" data-a="close">Close</button></div>
      <textarea readonly rows="3" aria-label="Values"></textarea></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.text = el.querySelector('textarea');
    for (const inp of el.querySelectorAll('input')) {
      inp.addEventListener('input', () => { applyTune({ [inp.dataset.k]: parseFloat(inp.value) }, this.world); this._save(); this._sync(); });
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'close') this.show(false);
      else if (a === 'reset') { applyTune(PHYS_DEFAULTS, this.world); try { localStorage.removeItem(KEY); } catch { /* ignore */ } this._sync(); }
      else if (a === 'copy') {
        this.text.select();
        if (navigator.clipboard) navigator.clipboard.writeText(this.text.value).then(() => { e.target.textContent = 'Copied ✓'; }, () => {});
      }
    });
    for (const t of ['touchstart', 'touchend', 'pointerdown', 'pointerup']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }

  _save() { try { localStorage.setItem(KEY, JSON.stringify(currentTune())); } catch { /* storage blocked */ } }

  _sync() {
    for (const inp of this.el.querySelectorAll('input')) {
      const k = inp.dataset.k;
      inp.value = PHYS[k];
      const o = this.el.querySelector(`[data-o="${k}"]`);
      o.textContent = String(Math.round(PHYS[k] * 100) / 100) + (PHYS[k] !== PHYS_DEFAULTS[k] ? ' •' : '');
    }
    this.text.value = JSON.stringify(currentTune());
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (on) { this._sync(); this.el.querySelector('[data-a="copy"]').textContent = 'Copy values'; }
  }
}
