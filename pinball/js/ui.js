// DOM overlay: HUD, messages, popups, title / game-over screens, plunger button.
import { ACHIEVEMENTS } from './game.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.root = $('#ui');
    this.scoreEl = $('#score'); this.ballsEl = $('#balls'); this.multEl = $('#mult'); this.comboEl = $('#combo');
    this.msgEl = $('#msg'); this.toastEl = $('#toast'); this.popLayer = $('#pops');
    this.plungerBtn = $('#plunger'); this.plungerFill = $('#plungerFill');
    this.camName = $('#camName');
    this.popups = [];
    this.msgQueue = []; this.msgUntil = 0;
    this.shownScore = 0;
    this.project = null; // (x,y,h) -> {x,y} screen
  }

  message(title, sub = '', color = '#ffe08a', dur = 1.5) {
    this.msgQueue.push({ title, sub, color, dur });
    if (this.msgQueue.length > 3) this.msgQueue.splice(0, this.msgQueue.length - 3);
  }
  showNext(now) {
    const m = this.msgQueue.shift(); if (!m) return;
    this.msgEl.innerHTML = `<div class="t">${m.title}</div>${m.sub ? `<div class="s">${m.sub}</div>` : ''}`;
    this.msgEl.style.setProperty('--c', m.color);
    this.msgEl.classList.remove('show'); void this.msgEl.offsetWidth; this.msgEl.classList.add('show');
    this.msgUntil = now + m.dur * 1000;
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show'); void this.toastEl.offsetWidth; this.toastEl.classList.add('show');
  }

  popup(text, x, y) {
    if (!this.project) return;
    const el = document.createElement('div'); el.className = 'pop'; el.textContent = text;
    this.popLayer.appendChild(el);
    this.popups.push({ el, x, y, t0: performance.now() });
    if (this.popups.length > 10) { const p = this.popups.shift(); p.el.remove(); }
  }

  bonus(v, x) { this.message('בונוס סוף כדור', `${fmt(v)}${x > 1 ? ` (x${x})` : ''}`, '#ffd27a', 2.4); }

  cameraName(n) {
    this.camName.textContent = '🎥 ' + n;
    this.camName.classList.remove('show'); void this.camName.offsetWidth; this.camName.classList.add('show');
  }

  setPlunger(visible, pull) {
    this.plungerBtn.classList.toggle('on', visible);
    this.plungerFill.style.transform = `scaleY(${pull})`;
  }

  update(game) {
    const now = performance.now();
    if (now > this.msgUntil) { if (this.msgQueue.length) this.showNext(now); else this.msgEl.classList.remove('show'); }
    // rolling score counter
    const target = game.score;
    if (this.shownScore !== target) {
      const d = target - this.shownScore;
      this.shownScore += Math.abs(d) < 10 ? d : d * 0.18;
      this.scoreEl.textContent = fmt(this.shownScore);
    }
    const bl = `${game.ballNum}/3`;
    if (this.ballsEl.dataset.v !== bl) { this.ballsEl.dataset.v = bl; this.ballsEl.innerHTML = [1, 2, 3].map((i) => `<i class="${i < game.ballNum ? 'used' : i === game.ballNum ? 'cur' : ''}"></i>`).join(''); }
    const mt = `x${game.mult}${game.bonusX > 1 ? ` · בונוס x${game.bonusX}` : ''}`;
    if (this.multEl.textContent !== mt) this.multEl.textContent = mt;
    const ct = game.combo >= 2 && game.time - game.lastShotT < 5 ? `קומבו x${game.combo}` : '';
    if (this.comboEl.textContent !== ct) this.comboEl.textContent = ct;
    // popups follow their world position
    this.popups = this.popups.filter((p) => {
      const age = (now - p.t0) / 1000;
      if (age > 1.1) { p.el.remove(); return false; }
      const s = this.project(p.x, p.y, 40);
      p.el.style.transform = `translate(${s.x}px, ${s.y - age * 60}px) translate(-50%,-50%) scale(${1 + Math.min(age * 4, 0.3)})`;
      p.el.style.opacity = String(1 - Math.max(0, age - 0.6) * 2);
      return true;
    });
  }

  // ---------------------------------------------------------------- screens
  renderTitle(best) {
    $('#bestScore').textContent = fmt(best.score || 0);
    $('#bestCombo').textContent = best.combo ? `x${best.combo}` : '—';
    $('#bestGames').textContent = String(best.games || 0);
    $('#achList').innerHTML = Object.entries(ACHIEVEMENTS).map(([id, name]) => `<li class="${best.achievements.includes(id) ? 'got' : ''}">${best.achievements.includes(id) ? '🏆' : '🔒'} ${name}</li>`).join('');
    $('#title').classList.add('show');
  }
  hideTitle() { $('#title').classList.remove('show'); }

  gameOver(r) {
    $('#overScore').textContent = fmt(r.score);
    $('#overRecord').innerHTML = r.newRecord
      ? `🎉 שיא אישי חדש, שרון! <small>(הקודם: ${fmt(r.prevBest)})</small>`
      : `השיא של שרון: ${fmt(r.best.score)} · עוד ${fmt(Math.max(0, r.best.score - r.score))} לשיא`;
    $('#overRecord').classList.toggle('rec', r.newRecord);
    $('#overStats').innerHTML = `<span>קומבו שיא במשחק: <b>${r.combo ? 'x' + r.combo : '—'}</b></span><span>קומבו שיא כללי: <b>${r.best.combo ? 'x' + r.best.combo : '—'}</b></span>`;
    $('#overAch').innerHTML = r.ach.length ? r.ach.map((a) => `<li class="got">🏆 ${ACHIEVEMENTS[a]}</li>`).join('') : '<li>נסו להשיג הישגים: מולטיבול, הצלת הנסיכה, מטמון…</li>';
    setTimeout(() => { $('#over').classList.add('show'); if (r.newRecord) this.confetti(); }, 1200);
  }
  hideOver() { $('#over').classList.remove('show'); }

  confetti() {
    const box = $('#confetti'); box.innerHTML = '';
    const cols = ['#ffd24a', '#7fe6ff', '#ff9ad0', '#b7ff8a', '#c39bff'];
    for (let i = 0; i < 90; i++) {
      const s = document.createElement('i');
      s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % cols.length];
      s.style.animationDelay = Math.random() * 1.2 + 's'; s.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(s);
    }
  }
}
