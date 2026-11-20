// Step 4 – what the player is told: banners (just under the HUD frame, clear of the ball and flippers),
// floating score pop-ups at the hit point, RUSH COMBO progress icons and the mode line in the score panel.
// Lives inside the HUD layer, so it is laid out in painting pixels. DOM nodes are pooled.
import { STAGES, HZ } from '../core/config.js';
import { flatToArt } from '../core/artmap.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const ICONS = { // tiny inline icons for the RUSH progress row
  mush: '<svg viewBox="0 0 24 24"><path d="M2 13a10 9 0 0 1 20 0z"/><rect x="9" y="12" width="6" height="9" rx="2"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path d="M12 1l7 9-7 13-7-13z"/></svg>',
  potion: '<svg viewBox="0 0 24 24"><path d="M9 2h6v2h-1v5l5 7a5 5 0 0 1-4 7H9a5 5 0 0 1-4-7l5-7V4H9z"/></svg>',
};
const RUSH = [['mush1', 'mush', 190, '#ff9a3a'], ['mush2', 'mush', 252, '#b070ff'], ['mush3', 'mush', 314, '#40ffd8'],
  ['crystal1', 'gem', 970, '#60fff0'], ['crystal2', 'gem', 1032, '#ffe060'], ['potion', 'potion', 1094, '#c080ff']];

export class Messages {
  constructor(hud, sim) {
    this.hud = hud;
    this.sim = sim;
    const root = hud.root;
    root.insertAdjacentHTML('beforeend', `
      <div class="banner" id="banner"></div>
      <div class="rush-row" id="rush-row">${RUSH.map(([id, kind, x, col]) => `<i data-id="${id}" style="left:${x - 22}px;--c:${col}">${ICONS[kind]}</i>`).join('')}</div>`);
    this.banner = hud.el('banner');
    this.rushIcons = [...root.querySelectorAll('#rush-row i')];
    this.queue = [];
    this.busy = 0;
    this.pops = [];
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('div');
      d.className = 'pop';
      root.appendChild(d);
      this.pops.push(d);
    }
    this.popIdx = 0;
    this.last = {};
    this.paused = false;
  }

  /** priority banners (chapter, multiball, jackpots, RUSH) replace whatever is waiting */
  show(html, priority = false) {
    if (priority) { this.queue = this.queue.filter((b) => b.p); this.queue.unshift({ html, p: true }); this.busy = 0; }
    else this.queue.push({ html, p: false });
    if (this.queue.length > 3) this.queue.length = 3;
  }

  popup(x, y, text, big) {
    const d = this.pops[this.popIdx++ % this.pops.length];
    const [ax, ay] = flatToArt(x, y);
    d.textContent = text;
    d.classList.toggle('big', !!big);
    d.style.left = `${Math.round(ax - 150)}px`;
    d.style.top = `${Math.round(ay - 90)}px`;
    d.classList.remove('live');
    void d.offsetWidth; // restart the animation
    d.classList.add('live');
  }

  bind(bus) {
    bus.on('score', (p) => { if (p.x !== null && p.points >= 50) this.popup(p.x, p.y, '+' + fmt(p.points), p.points >= 2000); });
    bus.on('stage', ({ index, initial }) => { if (!initial) this.show(STAGES[index].title.replace(': ', ':<br>'), true); });
    bus.on('rushStart', () => this.show('RUSH COMBO!<small>X2 SCORING · 30 SECONDS</small>', true));
    bus.on('rushEnd', () => this.show('<small>RUSH COMBO OVER</small>'));
    bus.on('doorOpen', () => this.show('THE TOWER OPENS!<small>SHOOT THE DOOR · 20 SECONDS</small>', true));
    bus.on('doorClose', ({ entered }) => { if (!entered) this.show('<small>THE TOWER DOOR CLOSES</small>'); });
    bus.on('towerEnter', () => this.show("WIZARD'S TOWER<br>MULTIBALL!<small>+15,000</small>", true));
    bus.on('superJackpot', () => this.show('SUPER JACKPOT!', true));
    bus.on('skillShot', () => this.show('SKILL SHOT!<small>+5,000</small>', true));
    bus.on('kickbackFire', () => this.show('KICKBACK!'));
    bus.on('kickback', ({ lit, fired }) => { if (lit && !fired && this.sim.rules.state === 'playing' && this.sim.rules.tick > 10) this.show('<small>KICKBACK LIT</small>'); });
    bus.on('multiballEnd', ({ reason }) => this.show(reason === 'timeout' ? 'MULTIBALL COMPLETE' : 'MULTIBALL OVER'));
    bus.on('loop', () => this.show('<small>LOOP +500</small>'));
    bus.on('ramp', ({ id }) => this.show(`<small>${id === 'rampA' ? 'CRYSTAL RAMP' : 'GOLDEN ORBIT'} +500</small>`));
    bus.on('comboChain', ({ level }) => { if (level >= 3) this.show(`COMBO x${level}!`); });
    bus.on('ballLost', ({ nextBall }) => this.show(`BALL ${nextBall}`, true));
    bus.on('ballRescue', () => this.show('<small>MAGIC RESCUE</small>'));
    bus.on('gameOver', ({ score, high, newHigh }) => this.show(`GAME OVER<small>${fmt(score)}${newHigh ? ' · NEW HIGH SCORE!' : ` · BEST ${fmt(high)}`}</small>`, true));
    bus.on('gameStart', () => { this.queue = []; this.busy = 0; this.banner.classList.remove('show'); });
  }

  update(dt) {
    const r = this.sim.rules;
    // mode line under the score
    let mode = '', flash = false;
    if (this.paused) mode = 'PAUSED';
    else if (r.state === 'playing') {
      const sec = (t) => Math.ceil(t / HZ);
      const parts = [];
      if (r.rushActive) { parts.push(`RUSH COMBO! X2 · ${sec(r.rushTicks)}`); flash = true; }
      if (r.multiball) parts.push(`MULTIBALL · ${sec(r.mbTicks)}`);
      if (r.doorOpen) parts.push(`TOWER OPEN · ${sec(r.doorTicks)}`);
      if (!r.multiball && !r.doorOpen && r.wizardCharge > 0) parts.push(`WIZARD ${'✦'.repeat(r.wizardCharge)}${'·'.repeat(3 - r.wizardCharge)}`);
      if (r.chain >= 2) parts.push(`COMBO x${r.chain}`);
      mode = parts.join('  ·  ');
    }
    if (this.last.mode !== mode) { this.last.mode = mode; this.hud.set('hud-mode', mode); }
    if (this.last.flash !== flash) { this.last.flash = flash; this.hud.el('hud-mode').classList.toggle('flash', flash); }
    // RUSH progress icons
    const key = r.rushActive ? 'rush' : [...r.combo].join();
    if (this.last.rush !== key) {
      this.last.rush = key;
      for (const i of this.rushIcons) { i.classList.toggle('on', r.combo.has(i.dataset.id)); i.classList.toggle('rush', r.rushActive); }
    }
    // banner queue
    if (this.busy > 0) this.busy -= dt;
    else if (this.queue.length) {
      const { html } = this.queue.shift();
      this.banner.innerHTML = html;
      this.banner.classList.remove('show');
      void this.banner.offsetWidth;
      this.banner.classList.add('show');
      this.busy = 1.7;
    }
  }
}
