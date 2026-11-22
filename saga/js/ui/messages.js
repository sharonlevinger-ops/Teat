// Step 4 – what the player is told: banners (just under the HUD frame, clear of the ball and flippers),
// floating score pop-ups at the hit point, RUSH COMBO progress icons and the mode line in the score panel.
// Lives inside the HUD layer, so it is laid out in painting pixels. DOM nodes are pooled.
import { STAGES, HZ, TIMING, LANES, MODES, TUNE } from '../core/config.js';
import { flatToArt } from '../core/artmap.js';
import { LOOK } from '../tables/looks.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const ICONS = { // tiny inline icons for the RUSH progress row
  mush: '<svg viewBox="0 0 24 24"><path d="M2 13a10 9 0 0 1 20 0z"/><rect x="9" y="12" width="6" height="9" rx="2"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path d="M12 1l7 9-7 13-7-13z"/></svg>',
  potion: '<svg viewBox="0 0 24 24"><path d="M9 2h6v2h-1v5l5 7a5 5 0 0 1-4 7H9a5 5 0 0 1-4-7l5-7V4H9z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M4 3h16v8c0 6-4 9-8 11-4-2-8-5-8-11z"/></svg>',
};
// where the goal arrow points on the active table (painting pixels: the tip of the arrow) – filled from LOOK
export const GOAL_AT = {};

export class Messages {
  constructor(hud, sim, tableLayer = hud.root) {
    this.hud = hud;
    this.sim = sim;
    const root = hud.root;
    for (const k of Object.keys(GOAL_AT)) delete GOAL_AT[k];
    Object.assign(GOAL_AT, LOOK.goalAt);
    const RUSH = LOOK.rushIcons, LANE_AT = LOOK.laneAt;
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
      tableLayer.appendChild(d); // pop-ups ride on the table (they follow the camera zoom)
      this.pops.push(d);
    }
    this.popIdx = 0;
    // the goal arrow rides on the table (follows the camera) and bobs over the current target
    this.arrow = document.createElement('div');
    this.arrow.className = 'goal-arrow hidden';
    this.arrow.innerHTML = '<svg viewBox="0 0 80 100" aria-hidden="true"><path d="M40 96 L6 52 H26 V4 H54 V52 H74 Z"/></svg>';
    tableLayer.appendChild(this.arrow);
    this.letters = LANES.map((ch, i) => {
      const d = document.createElement('div');
      d.className = 'lane-letter';
      d.textContent = ch;
      d.style.left = `${LANE_AT[i][0] - 30}px`;
      d.style.top = `${LANE_AT[i][1] - 32}px`;
      tableLayer.appendChild(d);
      return d;
    });
    this.count = null; // end-of-ball bonus count-up
    // progress lamps of this table: each group says how many are lit and when they blink
    this.lampGroups = LOOK.lamps.map((g) => ({ ...g, els: g.pts.map(([x, y]) => {
      const d = document.createElement('i');
      d.className = `lamp lamp-${g.cls}`;
      d.style.left = `${x - 11}px`; d.style.top = `${y - 11}px`;
      tableLayer.appendChild(d);
      return d;
    }) }));
    // drop targets (live: they sink into the table when hit) and an opening gate, on tables that have them
    this.dropEls = LOOK.dropTargets.map(({ seg: [a, b] }) => {
      const d = document.createElement('div');
      d.className = 'drop-target';
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI - 90;
      d.style.left = `${cx - 30}px`; d.style.top = `${cy - 34}px`; d.style.setProperty('--rot', `${ang}deg`);
      d.innerHTML = '<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M4 4 H56 V30 Q56 56 30 66 Q4 56 4 30 Z"/><path d="M30 12 V54 M14 32 H46" fill="none"/></svg>';
      tableLayer.appendChild(d);
      return d;
    });
    if (LOOK.gate) {
      const [[gx0, gy], [gx1]] = LOOK.gate.seg;
      this.gateEl = document.createElement('div');
      this.gateEl.className = 'castle-gate';
      this.gateEl.style.left = `${gx0}px`; this.gateEl.style.top = `${LOOK.gate.top}px`;
      this.gateEl.style.width = `${gx1 - gx0}px`; this.gateEl.style.height = `${gy - LOOK.gate.top}px`;
      tableLayer.appendChild(this.gateEl);
    }
    this.lockOrbs = LOOK.lockWindows.map(([x, y]) => {
      const d = document.createElement('i');
      d.className = 'lock-orb';
      d.style.left = `${x - 17}px`; d.style.top = `${y - 17}px`;
      tableLayer.appendChild(d);
      return d;
    });
    this.attractScene = true; // between games the score window shimmers (attract mode)
    this.last = {};
    this.paused = false;
  }

  /** priority banners (chapter, multiball, jackpots, RUSH) replace whatever is waiting */
  show(html, priority = false, count = null) {
    // priority banners replace whatever is waiting, but keep their own order (bonus, then "BALL 2")
    if (priority) { this.queue = [...this.queue.filter((b) => b.p), { html, p: true, count }]; this.busy = Math.min(this.busy, this.current && this.current.p ? this.busy : 0); }
    else this.queue.push({ html, p: false, count });
    if (this.queue.length > 4) this.queue.length = 4;
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
    bus.on('stage', ({ index, initial, level = 1 }) => { if (!initial) this.show(STAGES[index].title.replace(': ', ':<br>') + (level > 1 ? `<small>LEVEL ${level}</small>` : ''), true); });
    bus.on('rushStart', () => this.show('RUSH COMBO!<small>X2 SCORING · 30 SECONDS</small>', true));
    bus.on('rushEnd', () => this.show('<small>RUSH COMBO OVER</small>'));
    bus.on('doorOpen', () => this.show(`THE TOWER OPENS!<small>SHOOT THE DOOR · ${TIMING.DOOR_OPEN} SECONDS</small>`, true));
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
    // ---- table features
    bus.on('playerUp', ({ player, ball }) => this.show(`PLAYER ${player}<small>BALL ${ball} · YOUR TURN</small>`, true));
    // Forest Kingdom
    bus.on('gateCharge', ({ hits, of }) => { if (hits < of) this.show(`<small>CASTLE GATE ${hits} / ${of}</small>`); });
    bus.on('gateOpen', ({ seconds }) => this.show(`THE CASTLE GATE OPENS!<small>SHOOT INTO THE CASTLE · ${seconds} SECONDS</small>`, true));
    bus.on('princessRescued', ({ count, points }) => this.show(`PRINCESS RESCUED!<small>+${fmt(points)} · ROYAL X2 SCORING${count > 1 ? ` · RESCUE ${count}` : ''}</small>`, true));
    bus.on('princeQuest', ({ seconds }) => this.show(`THE PRINCE'S QUEST!<small>HIT THE CASTLE GATE · ${seconds} SECONDS</small>`, true));
    bus.on('questEnd', ({ collected, points }) => this.show(collected ? `QUEST COMPLETE!<small>+${fmt(points)}</small>` : '<small>THE QUEST IS OVER</small>', collected));
    bus.on('dwarfLit', ({ count, of }) => { if (count < of) this.show(`<small>DWARF ${count} OF ${of} AWAKE</small>`); });
    bus.on('gemJackpot', ({ points }) => this.show(`GEM JACKPOT!<small>THE DWARVES DUG DEEP · +${fmt(points)}</small>`, true));
    bus.on('ballLock', ({ count, of }) => this.show(`BALL ${count} LOCKED<small>${count < of ? `OPEN THE TOWER AGAIN TO LOCK BALL ${count + 1}` : 'NEXT TIME: MULTIBALL!'}</small>`, true));
    bus.on('addABall', ({ seconds }) => this.show(`ADD-A-BALL!<small>+1 BALL · +${seconds} SECONDS</small>`, true));
    bus.on('superSkillArmed', () => this.show('<small>SUPER SKILL SHOT · SHOOT THE GOLDEN RAMP</small>'));
    bus.on('superSkillShot', ({ points }) => this.show(`SUPER SKILL SHOT!<small>+${fmt(points)}</small>`, true));
    bus.on('match', ({ number, digit, won }) => this.show(`MATCH ${String(number).padStart(2, '0')}<small>${won ? 'IT MATCHES! ONE MORE BALL' : `YOUR SCORE ENDS ${String(digit).padStart(2, '0')}`}</small>`, true));
    bus.on('mystery', ({ label }) => this.show(`MYSTERY<small>${label}</small>`, true));
    bus.on('extraBallLit', ({ source }) => this.show(`EXTRA BALL IS LIT<small>${source === 'mystery' ? 'FROM THE MYSTERY HOLE · ' : ''}SHOOT THE MYSTERY HOLE</small>`, true));
    bus.on('extraBall', () => this.show('EXTRA BALL!<small>YOU WILL SHOOT AGAIN</small>', true));
    bus.on('shootAgain', () => this.show('SHOOT AGAIN<small>SAME PLAYER, SAME BALL</small>', true));
    bus.on('poolLit', ({ value }) => this.show(`POOL JACKPOT LIT<small>${fmt(value)} · ROLL THROUGH THE POOL</small>`));
    bus.on('poolJackpot', ({ points }) => this.show(`POOL JACKPOT!<small>+${fmt(points)}</small>`, true));
    bus.on('bonusX', ({ x }) => this.show(`BONUS X${x}<small>M-A-G-E COMPLETE</small>`));
    bus.on('lanesComplete', ({ points, maxed }) => { if (maxed) this.show(`<small>M-A-G-E COMPLETE · +${fmt(points)}</small>`); });
    bus.on('bonus', ({ base, x, points }) => this.show(`BONUS 0<small>${fmt(base)} × ${x}</small>`, true, { base, x, points }));
    bus.on('frenzyStart', ({ seconds }) => this.show(`SPORE FRENZY!<small>MUSHROOMS X${MODES.FRENZY_MULT} · ${seconds} SECONDS</small>`, true));
    bus.on('frenzyEnd', () => this.show('<small>SPORE FRENZY OVER</small>'));
    bus.on('crystalLit', ({ value }) => this.show(`CRYSTAL JACKPOT LIT<small>${fmt(value)} · RIDE THE CRYSTAL RAMP</small>`));
    bus.on('crystalJackpot', ({ points }) => this.show(`CRYSTAL JACKPOT!<small>+${fmt(points)}</small>`, true));
    bus.on('doubleOrbit', ({ points }) => this.show(`DOUBLE ORBIT!<small>+${fmt(points)}</small>`, true));
    bus.on('hurryUp', ({ points }) => { if (points > 0) this.show(`HURRY-UP<small>+${fmt(points)}</small>`); });
    bus.on('chapterMission', ({ name, points }) => this.show(`${name}<small>CHAPTER MISSION COMPLETE · +${fmt(points)}</small>`, true));
    bus.on('boostStart', ({ seconds }) => this.show(`DOUBLE SCORING<small>${seconds} SECONDS</small>`));
    bus.on('dragonReady', () => this.show("DRAGON'S FIRE IS READY<small>SHOOT THE MYSTERY HOLE</small>", true));
    bus.on('dragonStart', ({ seconds }) => this.show(`DRAGON'S FIRE!<small>HIT EVERY BURNING TARGET · ${seconds} SECONDS</small>`, true));
    bus.on('dragonWave', ({ wave, points }) => this.show(`WAVE ${wave} CLEARED!<small>+${fmt(points)} · THE FIRE RISES</small>`, true));
    bus.on('dragonEnd', ({ completed, victory, level }) => {
      if (!completed) this.show("<small>THE DRAGON ESCAPES · SHOOT THE MYSTERY HOLE TO FIGHT AGAIN</small>");
      else this.show(`${victory ? 'DRAGON DEFEATED!' : 'THE DRAGON SLEEPS'}<small>THE SAGA BEGINS AGAIN · LEVEL ${level}</small>`, true);
    });
    bus.on('tiltWarning', ({ count, of }) => this.show(`TILT WARNING<small>${count} OF ${of} · EASY ON THE NUDGES</small>`, true));
    bus.on('tilt', () => this.show('TILT!<small>FLIPPERS OFF UNTIL THE NEXT BALL</small>', true));
    bus.on('ballSaved', () => this.show('BALL SAVED!<small>LAUNCH AGAIN</small>', true));
    bus.on('ballRescue', () => this.show('<small>MAGIC RESCUE</small>'));
    bus.on('gameOver', ({ score, high, newHigh, scores, winner }) => this.show(scores && scores.length > 1
      ? `PLAYER ${winner} WINS<small>${fmt(score)}${newHigh ? ' · NEW HIGH SCORE!' : ''}</small>`
      : `GAME OVER<small>${fmt(score)}${newHigh ? ' · NEW HIGH SCORE!' : ` · BEST ${fmt(high)}`}</small>`, true));
    bus.on('gameStart', () => { this.queue = []; this.busy = 0; this.current = null; this.count = null; this.banner.classList.remove('show'); });
  }

  update(dt) {
    const r = this.sim.rules;
    // mode line under the score
    let mode = '', flash = false;
    if (this.paused) mode = 'PAUSED';
    else if (r.state === 'playing') {
      const sec = (t) => Math.ceil(t / HZ);
      const parts = [];
      if (r.numPlayers > 1) parts.push(`PLAYER ${r.player + 1}`);
      if (r.tilted) { parts.push('TILT'); flash = true; }
      if (r.dragonActive) { parts.push(`DRAGON'S FIRE · ${sec(r.dragonTicks)}`); flash = true; }
      if (r.multiball) parts.push(`MULTIBALL · ${sec(r.mbTicks)}`);
      if (r.doorOpen) parts.push(`TOWER OPEN · ${sec(r.doorTicks)}`);
      if (r.rushActive) { parts.push(`RUSH COMBO! X2 · ${sec(r.rushTicks)}`); flash = true; }
      if (r.frenzyActive) parts.push(`SPORE FRENZY · ${sec(r.frenzyTicks)}`);
      if (r.boostActive) parts.push(`X2 · ${sec(r.boostTicks)}`);
      if (r.questActive) parts.push(`PRINCE'S QUEST · ${sec(r.questTicks)}`);
      if (r.gateOpen) parts.push(`CASTLE OPEN · ${sec(r.gateTicks)}`);
      if (r.ballSaveActive) parts.push(`BALL SAVE · ${sec(r.saveTicks)}`);
      if (r.bonusX > 1) parts.push(`BONUS X${r.bonusX}`);
      if (!r.multiball && !r.doorOpen && r.wizardCharge > 0) parts.push(`WIZARD ${'✦'.repeat(r.wizardCharge)}${'·'.repeat(3 - r.wizardCharge)}`);
      if (r.chain >= 2) parts.push(`COMBO x${r.chain}`);
      mode = parts.slice(0, 3).join('  ·  '); // the three most important, in priority order (keeps the line inside the frame)
    }
    if (this.last.mode !== mode) { this.last.mode = mode; this.hud.set('hud-mode', mode); }
    if (this.last.flash !== flash) { this.last.flash = flash; this.hud.el('hud-mode').classList.toggle('flash', flash); }
    // next goal line (bottom of the painting) + arrow on the target
    const g = r.goal;
    const gk = g ? g.text + '|' + g.sub : '';
    if (this.last.goal !== gk) {
      this.last.goal = gk;
      this.hud.el('hud-goal').classList.toggle('hidden', !g);
      if (g) { this.hud.set('goal-text', g.text); this.hud.set('goal-sub', g.sub); }
    }
    const tgt = g ? g.target : '';
    if (this.last.target !== tgt) {
      this.last.target = tgt;
      this.arrow.classList.toggle('hidden', !tgt);
      if (tgt) { const [x, y] = GOAL_AT[g.target]; this.arrow.style.left = `${x - 40}px`; this.arrow.style.top = `${y - 100}px`; }
    }
    // a little animated scene in the score window for the mode in play (like the dot-matrix display of a real table)
    const scene = this.paused ? '' : r.state !== 'playing' ? (this.attractScene ? 'rush' : '') : r.dragonActive ? 'dragon' : r.multiball ? 'multiball' : r.frenzyActive ? 'frenzy' : r.rushActive ? 'rush' : r.boostActive ? 'boost' : '';
    if (this.last.scene !== scene) { this.last.scene = scene; this.hud.el('mode-scene').className = 'mode-scene' + (scene ? ' on ' + scene : ''); }
    // lane letters: lit ones glow; they move with every flipper press
    this.time = (this.time || 0) + dt;
    // in attract mode the letters chase across the lanes (M → A → G → E)
    const lit = r.state === 'playing' ? r.lanes : LANES.map((_, i) => Math.floor(this.time * 3) % 6 === i || Math.floor(this.time * 3) % 6 === 5);
    const lk = lit.map((v) => (v ? 1 : 0)).join('');
    if (this.last.lanes !== lk) {
      this.last.lanes = lk;
      this.letters.forEach((d, i) => { d.classList.toggle('on', !!lit[i]); d.classList.remove('hidden'); });
    }
    // progress lamps + locked balls in the tower windows
    const playing = r.state === 'playing';
    const blink = Math.floor(this.time * 4) % 2 === 0;
    const states = playing ? this.lampGroups.map((g) => [g.count(r, TUNE), g.flash(r)]) : [];
    const lampKey = playing ? states.map(([n, f]) => `${n}${f && blink}`).join('|') + `|${r.locks}|${(r.shieldsDown || []).join()}|${r.gateOpen}` : '';
    if (this.last.lampKey !== lampKey) {
      this.last.lampKey = lampKey;
      this.lampGroups.forEach((g, gi) => {
        const [n, flashing] = states[gi] || [0, false];
        g.els.forEach((d, i) => { d.classList.toggle('on', playing && i < n && (!flashing || blink)); d.classList.toggle('hidden', !playing); });
      });
      this.lockOrbs.forEach((d, i) => d.classList.toggle('on', playing && i < r.locks));
      this.dropEls.forEach((d, i) => d.classList.toggle('down', playing && !!(r.shieldsDown && r.shieldsDown[i])));
      if (this.gateEl) this.gateEl.classList.toggle('open', playing && !!r.gateOpen);
    }
    // end-of-ball bonus: the total counts up inside the banner
    if (this.count && this.count.t !== undefined && !this.paused) {
      const c = this.count;
      c.t += dt;
      const k = Math.min(1, c.t / 1.1);
      const shown = Math.round(c.points * (1 - Math.pow(1 - k, 3)));
      this.banner.innerHTML = `BONUS ${fmt(shown)}<small>${fmt(c.base)} × ${c.x}</small>`;
      if (k >= 1) this.count = null;
    }
    // RUSH progress icons
    const key = r.rushActive ? 'rush' : [...r.combo].join();
    if (this.last.rush !== key) {
      this.last.rush = key;
      for (const i of this.rushIcons) { i.classList.toggle('on', r.combo.has(i.dataset.id)); i.classList.toggle('rush', r.rushActive); }
    }
    // banner queue
    if (this.busy > 0) this.busy -= dt;
    else if (this.queue.length) {
      const item = this.queue.shift();
      this.current = item;
      this.banner.innerHTML = item.html;
      this.count = item.count ? { ...item.count, t: 0 } : null;
      this.banner.classList.remove('show');
      void this.banner.offsetWidth;
      this.banner.classList.add('show');
      this.busy = 1.7;
    }
  }
}
