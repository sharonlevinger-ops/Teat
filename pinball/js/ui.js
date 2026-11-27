// DOM overlay: HUD, messages, popups, title / game-over screens, plunger button.
import { ACHIEVEMENTS, PRACTICE } from './game.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor() {
    this.root = $('#ui');
    this.scoreEl = $('#score'); this.ballsEl = $('#balls'); this.multEl = $('#mult'); this.comboEl = $('#combo');
    this.msgEl = $('#msg'); this.toastEl = $('#toast'); this.popLayer = $('#pops');
    this.plungerBtn = $('#plunger'); this.plungerFill = $('#plungerFill');
    this.camName = $('#camName');
    this.goalEl = $('#goal');
    this.on = {}; // callbacks set by main: togglePlayer(id), removePlayer(id), addPlayer(name)
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

  popup(value, x, y) {
    if (!this.project) return;
    const now = performance.now();
    const sp = this.project(x, y, 40);
    // merge with a recent popup close by, so rapid hits show one growing number
    const near = this.popups.find((p) => now - p.t0 < 700 && Math.hypot(p.sx - sp.x, p.sy - sp.y) < 80);
    if (near) {
      near.value += value; near.el.textContent = '+' + fmt(near.value); near.t0 = now;
      near.el.classList.remove('bump'); void near.el.offsetWidth; near.el.classList.add('bump');
      return;
    }
    const el = document.createElement('div'); el.className = 'pop'; el.textContent = '+' + fmt(value);
    this.popLayer.appendChild(el);
    this.popups.push({ el, x, y, sx: sp.x, sy: sp.y, value, t0: now });
    while (this.popups.length > 4) { const p = this.popups.shift(); p.el.remove(); }
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
    const nb = game.practice ? 0 : game.maxBalls;
    const bl = `${game.ballNum}/${nb}`;
    if (this.ballsEl.dataset.v !== bl) { this.ballsEl.dataset.v = bl; this.ballsEl.innerHTML = Array.from({ length: nb }, (_, k) => k + 1).map((i) => `<i class="${i < game.ballNum ? 'used' : i === game.ballNum ? 'cur' : ''}"></i>`).join(''); }
    const who = game.players && game.players.length > 1 ? `${game.player.name} · ` : '';
    const mt = game.practice ? 'אימון' : `${who}x${game.mult}${game.bonusX > 1 ? ` · בונוס x${game.bonusX}` : ''}`;
    if (this.multEl.textContent !== mt) this.multEl.textContent = mt;
    const saveLeft = game.state === 'playing' && game.ballSave > 0 ? Math.ceil(game.ballSave) : 0;
    const ct = game.combo >= 2 && game.time - game.lastShotT < 5 ? `קומבו x${game.combo}` : saveLeft ? `🛡 הצלת כדור ${saveLeft}` : '';
    if (this.comboEl.textContent !== ct) this.comboEl.textContent = ct;
    const goal = game.state === 'playing' ? game.nextGoal() : '';
    if (this.goalEl.textContent !== goal) this.goalEl.textContent = goal;
    this.goalEl.classList.toggle('on', !!goal && !this.msgEl.classList.contains('show'));
    // popups follow their world position
    const msgBox = this.msgEl.classList.contains('show') ? this.msgEl.getBoundingClientRect() : null;
    this.popups = this.popups.filter((p) => {
      const age = (now - p.t0) / 1000;
      if (age > 1.1) { p.el.remove(); return false; }
      const s = this.project(p.x, p.y, 40);
      p.sx = s.x; p.sy = s.y;
      let py = s.y - age * 60;
      // never draw a score number on top of the message banner
      if (msgBox && py > msgBox.top - 12 && py < msgBox.bottom + 12 && s.x > msgBox.left - 40 && s.x < msgBox.right + 40) py = msgBox.bottom + 22;
      p.el.style.transform = `translate(${s.x}px, ${py}px) translate(-50%,-50%) scale(${1 + Math.min(age * 4, 0.3)})`;
      p.el.style.opacity = String(1 - Math.max(0, age - 0.6) * 2);
      return true;
    });
  }

  // ---------------------------------------------------------------- screens
  // model: { profiles, best, bestName, daily: {challenge, doneToday, streak}, hist, hasSave, standalone }
  renderTitle(m) {
    const best = m.best;
    $('#bestLbl').textContent = `🏆 השיא של ${m.bestName}`;
    $('#bestScore').textContent = fmt(best.score || 0);
    $('#bestCombo').textContent = best.combo ? `x${best.combo}` : '—';
    $('#bestGames').textContent = String(best.games || 0);
    $('#achList').innerHTML = Object.entries(ACHIEVEMENTS).map(([id, name]) => `<li class="${best.achievements.includes(id) ? 'got' : ''}">${best.achievements.includes(id) ? '🏆' : '🔒'} ${name}</li>`).join('');
    // players
    const sel = m.profiles.selected;
    const box = $('#players'); box.innerHTML = '';
    for (const p of m.profiles.list) {
      const i = sel.indexOf(p.id);
      const b = document.createElement('button');
      b.className = 'chip' + (i >= 0 ? ' on' : '');
      b.innerHTML = `${esc(p.name)}${i >= 0 && sel.length > 1 ? `<span class="ord">${i + 1}</span>` : ''}${m.profiles.list.length > 1 ? '<span class="x" data-x="1" aria-label="מחיקה">✕</span>' : ''}`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.dataset.x) { this.confirmRemove(p, b); return; } this.on.togglePlayer?.(p.id); });
      box.appendChild(b);
    }
    // daily challenge + history
    const d = m.daily;
    const dl = $('#daily');
    dl.classList.toggle('done', d.doneToday);
    dl.innerHTML = `<div class="dl">🎯 האתגר של היום${d.streak ? ` · רצף ${d.streak} ${d.streak === 1 ? 'יום' : 'ימים'} 🔥` : ''}</div>${d.doneToday ? '✅ ' : ''}${esc(d.challenge.text)}`;
    const h = m.hist;
    $('#hist').innerHTML = h ? `ממוצע 10 אחרונים <b>${fmt(h.avg)}</b>${h.trend !== null ? ` ${h.trend >= 0 ? '▲' : '▼'}${Math.abs(Math.round(h.trend * 100))}%` : ''} · אחרונים: ${h.recent.map((v) => `<b>${fmt(v)}</b>`).join(' · ')}` : '';
    $('#btnContinue').hidden = !m.hasSave;
    $('#btnStart').textContent = sel.length > 1 ? `משחק ל-${sel.length} שחקנים` : 'התחלת משחק';
    $('#installHint').hidden = !!m.standalone;
    $('#title').classList.add('show');
  }
  confirmRemove(p, chip) {
    if (chip.dataset.confirm) { this.on.removePlayer?.(p.id); return; }
    chip.dataset.confirm = '1';
    chip.innerHTML = `למחוק את ${esc(p.name)}? <span class="x" data-x="1">✓</span>`;
    setTimeout(() => { if (chip.isConnected && chip.dataset.confirm) this.on.refresh?.(); }, 2500);
  }
  showScreen(id, on = true) { $('#' + id).classList.toggle('show', on); }

  renderSettings(st) {
    for (const seg of document.querySelectorAll('#settingsScr .seg')) {
      const k = seg.dataset.key;
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', String(st[k]) === b.dataset.val);
    }
  }

  renderRulesLive(game) {
    const el = $('#rulesLive');
    if (game.state !== 'playing' || game.practice) { el.textContent = ''; return; }
    el.innerHTML = `<b>עכשיו:</b> ${esc(game.nextGoal())}<br>נעילות מגדל ${game.towerLocks}/3 · שער הטירה ${game.gateOpen ? 'פתוח' : game.castleHits + '/3'} · גמדים ${game.dwarfs}/7 · M-A-G-E ${game.mage.filter(Boolean).length}/4${game.finalReady ? ' · ⚔️ הקרב האחרון מוכן' : ''}`;
  }

  practiceOver(key, st) {
    $('#overScore').textContent = `${st.hits}/${st.tries}`;
    $('#overRecord').innerHTML = `אימון ${esc(PRACTICE[key].name)} · ${st.tries ? Math.round((st.hits / st.tries) * 100) : 0}% הצלחה`;
    $('#overStats').innerHTML = '';
    $('#overPlayers').hidden = true;
    $('#overInsights').innerHTML = st.hits / Math.max(1, st.tries) < 0.3 ? `<li>${esc(PRACTICE[key].flipper)}: נסו ללחוץ כשהכדור קרוב יותר לקצה הפליפר</li>` : '<li>יפה! נסו עכשיו במשחק אמיתי</li>';
    $('#overAch').innerHTML = '';
    setTimeout(() => $('#over').classList.add('show'), 300);
  }

  hideTitle() { $('#title').classList.remove('show'); }

  gameOver(r) {
    $('#overScore').textContent = fmt(r.score);
    $('#overRecord').innerHTML = r.newRecord
      ? `🎉 שיא אישי חדש, ${esc(r.name)}! <small>(הקודם: ${fmt(r.prevBest)})</small>`
      : `השיא של ${esc(r.name)}: ${fmt(r.best.score)} · עוד ${fmt(Math.max(0, r.best.score - r.score))} לשיא`;
    $('#overRecord').classList.toggle('rec', r.newRecord);
    $('#overStats').innerHTML = `<span>קומבו שיא במשחק: <b>${r.combo ? 'x' + r.combo : '—'}</b></span><span>קומבו שיא כללי: <b>${r.best.combo ? 'x' + r.best.combo : '—'}</b></span>`;
    const rank = $('#overPlayers');
    rank.hidden = !r.players;
    if (r.players) rank.innerHTML = r.players.map((p, i) => `<li>${i === 0 ? '👑 ' : ''}${esc(p.name)}<b>${fmt(p.score)}</b>${p.newRecord ? ' 🎉' : ''}</li>`).join('');
    $('#overInsights').innerHTML = (r.insights || []).map((t) => `<li>${esc(t)}</li>`).join('');
    $('#overAch').innerHTML = r.ach.length ? r.ach.map((a) => `<li class="got">🏆 ${ACHIEVEMENTS[a]}</li>`).join('') : '<li>נסו להשיג הישגים: מולטיבול, הצלת הנסיכה, מטמון…</li>';
    setTimeout(() => { $('#over').classList.add('show'); if (r.newRecord || (r.players && r.players.some((p) => p.newRecord))) this.confetti(); }, 1200);
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
