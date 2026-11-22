// Hidden designer tuning panel (not a player option). Opens with #tune in the address, or by holding the
// "Paused" title for 1.2 s. Sliders change the physics live; values are kept on this device and can be
// copied out as JSON, so the chosen numbers can be written into config.js.
import { PHYS, PHYS_DEFAULTS, TUNE, TUNE_DEFAULTS } from '../core/config.js';

// [key, label, min, max, step, group]; physics keys live in PHYS, feature keys in TUNE (same names in the saved JSON)
export const TUNABLE = [
  ['TIME_SCALE', 'Game speed', 0.5, 1.1, 0.01, 'phys'],
  ['GRAVITY', 'Gravity', 30, 75, 1, 'phys'],
  ['FLIPPER_UP_SPEED', 'Flipper power', 16, 36, 0.5, 'phys'],
  ['SLING_KICK', 'Slingshot kick', 15, 45, 1, 'phys'],
  ['BUMPER_KICK', 'Mushroom kick', 15, 40, 1, 'phys'],
  ['KICKBACK_SPEED', 'Kickback', 35, 70, 1, 'phys'],
  ['PLUNGER_MAX', 'Plunger max', 55, 90, 1, 'phys'],
  ['LINEAR_DAMP', 'Rolling drag', 0, 0.3, 0.01, 'phys'],
  ['SCOOP_CATCH', 'Scoop catch speed', 30, 95, 1, 'feat'],
  ['FRENZY_HITS', 'Hits to Frenzy', 10, 50, 1, 'feat'],
  ['POOL_PASSES', 'Pool passes', 3, 10, 1, 'feat'],
  ['CRYSTAL_SEQ', 'Crystal alternations', 2, 6, 1, 'feat'],
  ['DOUBLE_ORBIT_WINDOW', 'Double Orbit window (s)', 3, 10, 0.5, 'feat'],
];
const KEY = 'saga.tune';
const store = (group) => (group === 'phys' ? PHYS : TUNE);
const defaults = (group) => (group === 'phys' ? PHYS_DEFAULTS : TUNE_DEFAULTS);
const DEFAULTS = Object.fromEntries(TUNABLE.map(([k, , , , , g]) => [k, defaults(g)[k]]));

/** Apply a saved/loaded set of values (unknown keys and out-of-range numbers are ignored). */
export function applyTune(values, world) {
  for (const [k, , min, max, , g] of TUNABLE) {
    const v = values && values[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) store(g)[k] = v;
  }
  if (world) world.gravity = PHYS.GRAVITY;
}

export function currentTune() {
  const o = {};
  for (const [k, , , , , g] of TUNABLE) o[k] = store(g)[k];
  return o;
}

/** true when any tunable value differs from its default */
export function tuneIsCustom() {
  return TUNABLE.some(([k, , , , , g]) => store(g)[k] !== DEFAULTS[k]);
}

export function resetTune(world) { applyTune(DEFAULTS, world); }

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
      <h4>Physics</h4>
      ${TUNABLE.filter((t) => t[5] === 'phys').map(([k, label, min, max, step]) => `<label><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"><output data-o="${k}"></output></label>`).join('')}
      <h4>Table features</h4>
      ${TUNABLE.filter((t) => t[5] === 'feat').map(([k, label, min, max, step]) => `<label><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"><output data-o="${k}"></output></label>`).join('')}
      <div class="tune-row"><button class="gold-btn small" data-a="copy">Copy values</button><button class="gold-btn ghost small" data-a="reset">Defaults</button><button class="gold-btn ghost small" data-a="close">Close</button></div>
      <div class="tune-row"><button class="gold-btn ghost small" data-a="fps">FPS meter on/off</button></div>
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
      else if (a === 'fps') window.dispatchEvent(new Event('saga-fps'));
      else if (a === 'reset') { resetTune(this.world); try { localStorage.removeItem(KEY); } catch { /* ignore */ } this._sync(); }
      else if (a === 'copy') {
        this.text.select();
        if (navigator.clipboard) navigator.clipboard.writeText(this.text.value).then(() => { e.target.textContent = 'Copied ✓'; }, () => {});
      }
    });
    for (const t of ['touchstart', 'touchend', 'pointerdown', 'pointerup']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }

  _save() { try { localStorage.setItem(KEY, JSON.stringify(currentTune())); } catch { /* storage blocked */ } }

  _sync() {
    const cur = currentTune();
    for (const inp of this.el.querySelectorAll('input')) {
      const k = inp.dataset.k;
      inp.value = cur[k];
      const o = this.el.querySelector(`[data-o="${k}"]`);
      o.textContent = String(Math.round(cur[k] * 100) / 100) + (cur[k] !== DEFAULTS[k] ? ' •' : '');
    }
    this.text.value = JSON.stringify(currentTune());
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (on) { this._sync(); this.el.querySelector('[data-a="copy"]').textContent = 'Copy values'; }
  }
}
