// The Journal: today's three missions (+ streak), achievements and the high-score table, in one card with tabs.
// Opens from the pause menu, or from the pause button between games. Reads everything from Progress.
import { ACHIEVEMENTS } from '../core/progress.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const TABS = [['missions', 'Missions'], ['awards', 'Achievements'], ['scores', 'Scores']];

export class Journal {
  constructor(progress) {
    this.progress = progress;
    this.tab = 'missions';
    this.highlight = -1; // place of the last game in the score table
    const el = document.createElement('section');
    el.className = 'overlay journal hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Journal');
    el.innerHTML = `<div class="card journal-card">
      <header class="card-head"><h2>Journal</h2><button class="icon-btn" data-a="close" aria-label="Close">✕</button></header>
      <nav class="tabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" data-tab="${id}">${label}</button>`).join('')}</nav>
      <div class="tab-body" role="tabpanel"></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.body = el.querySelector('.tab-body');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = e.target.closest('[data-tab]');
      if (t) { this.tab = t.dataset.tab; this.render(); return; }
      if (e.target.closest('[data-a="close"]') || e.target === el) this.show(false);
    });
    this.onClose = () => {};
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(on, tab) {
    if (tab) this.tab = tab;
    this.el.classList.toggle('hidden', !on);
    if (on) this.render(); else this.onClose();
  }

  render() {
    for (const b of this.el.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    const p = this.progress;
    if (this.tab === 'missions') {
      const ms = p.missions, done = ms.filter((m) => m.done).length;
      this.body.innerHTML = `
        <p class="lead">New missions every day. Finish all three to grow your streak.</p>
        <div class="chips"><span class="chip">${done} / 3 done today</span><span class="chip gold">Streak: ${p.streak} ${p.streak === 1 ? 'day' : 'days'}</span></div>
        <ul class="missions">${ms.map((m) => `
          <li class="${m.done ? 'done' : ''}">
            <div class="m-row"><span class="m-text">${esc(m.text)}</span><span class="m-count">${m.done ? '✓' : `${m.count} / ${m.n}`}</span></div>
            <div class="bar"><i style="width:${Math.round((m.count / m.n) * 100)}%"></i></div>
          </li>`).join('')}</ul>`;
    } else if (this.tab === 'awards') {
      const got = ACHIEVEMENTS.filter((a) => p.hasAchievement(a.id)).length;
      this.body.innerHTML = `
        <div class="chips"><span class="chip gold">${got} / ${ACHIEVEMENTS.length} unlocked</span></div>
        <ul class="awards">${ACHIEVEMENTS.map((a) => `
          <li class="${p.hasAchievement(a.id) ? 'got' : ''}"><b>${esc(a.name)}</b><span>${esc(a.text)}</span></li>`).join('')}</ul>`;
    } else {
      const s = p.scores;
      this.body.innerHTML = s.length ? `
        <table class="scores"><thead><tr><th>#</th><th>Score</th><th>Chapter</th><th>Date</th></tr></thead><tbody>
        ${s.map((r, i) => `<tr class="${i + 1 === this.highlight ? 'new' : ''}"><td>${i + 1}</td><td>${fmt(r.score)}</td><td>${r.chapter}</td><td>${esc(r.day.slice(5).replace('-', '/'))}</td></tr>`).join('')}
        </tbody></table>` : '<p class="lead empty">No games yet. Your best 10 scores will appear here.</p>';
    }
  }
}
