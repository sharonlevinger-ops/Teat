// End-of-game summary: final score, its place in the score table, the chapter reached, what happened this
// game, and today's missions. "Play again" starts a new game; "Journal" opens the full journal on top.
import { STAGES } from '../core/config.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class Summary {
  constructor(progress, stats) {
    this.progress = progress;
    this.stats = stats;
    const el = document.createElement('section');
    el.className = 'overlay summary hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Game over');
    el.innerHTML = `<div class="card summary-card">
      <h2>Game Over</h2>
      <div class="sum-score" id="sum-score">0</div>
      <div class="sum-place" id="sum-place"></div>
      <div class="sum-chapter" id="sum-chapter"></div>
      <div class="sum-stars" id="sum-stars"></div>
      <dl class="sum-stats" id="sum-stats"></dl>
      <div class="sum-missions" id="sum-missions"></div>
      <button class="gold-btn" id="btn-again">Play again</button>
      <div class="btn-row"><button class="gold-btn ghost" id="btn-sum-journal">Journal</button><button class="gold-btn ghost" id="btn-sum-close">Close</button></div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.$ = (id) => el.querySelector('#' + id);
    el.addEventListener('click', (e) => e.stopPropagation());
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show({ score, high, newHigh, place }) {
    const st = this.stats, p = this.progress;
    this.$('sum-score').textContent = fmt(score);
    this.$('sum-place').textContent = newHigh ? 'New best score!' : place ? `#${place} in your score table · best ${fmt(high)}` : `Best ${fmt(high)}`;
    this.$('sum-place').classList.toggle('best', !!newHigh);
    const ch = STAGES[Math.min(STAGES.length, st.chapter) - 1];
    this.$('sum-chapter').textContent = `Reached chapter ${ch.id} · ${ch.title.split(': ')[1]}`;
    const rows = [['Wizard hits', st.wizard], ['Tower visits', st.tower], ['Ramps & loops', st.ramps], ['Best combo', st.bestCombo >= 2 ? 'x' + st.bestCombo : '–'], ['Super jackpots', st.jackpots], ['Skill shots', st.skill]];
    const dl = this.$('sum-stats');
    dl.replaceChildren();
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = String(v);
      d.append(dt, dd); dl.appendChild(d);
    }
    const stars = this.$('sum-stars');
    stars.textContent = '★★★★★'.slice(0, p.starCount) + '☆☆☆☆☆'.slice(0, 5 - p.starCount);
    stars.setAttribute('aria-label', `${p.starCount} of 5 table stars`);
    const done = p.missions.filter((m) => m.done).length;
    this.$('sum-missions').textContent = `Today's missions: ${done} / 3 · streak ${p.streak} ${p.streak === 1 ? 'day' : 'days'}`;
    this.el.classList.remove('hidden');
    this.$('btn-again').focus({ preventScroll: true });
  }

  hide() { this.el.classList.add('hidden'); }
}
