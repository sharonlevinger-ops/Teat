// "How to play": every rule of the table in one scrollable card. All numbers come from config.js,
// so the explanation can never drift from the game. Opens from the pause menu and from the Journal.
import { TIMING, MODES, TUNE, SCORE, STAGES, LANES, TILT, WIZARD_CHARGES } from '../core/config.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function sections() {
  const ch = STAGES.map((s) => s.title.split(': ')[1]);
  return [
    ['Controls', [
      ['Flippers', 'Tap the left or right half of the screen.'],
      ['Launch', 'Touch the plunger (bottom-right) and pull down: the further you pull, the harder the shot. Release to shoot. (Just holding works too: the power builds up.) Release on the gold flash of the gem for a <b>skill shot</b> (+5,000).'],
      ['Super skill shot', `Hold the left flipper while you launch, then shoot the golden ramp within ${MODES.SUPER_SKILL_WINDOW} seconds (${fmt(MODES.SUPER_SKILL)}).`],
      ['Nudge', `Swipe up to shove the table (the sideways part of the swipe picks the direction). Too many nudges: ${TILT.WARNINGS} warnings, then <b>TILT</b> – flippers off and no points until the next ball.`],
    ]],
    ['Follow the arrow', [
      ['Goal line', 'The line under the table always shows the most valuable shot right now, and a gold arrow points at it. The small line shows the chapter mission and the points to the next chapter.'],
    ]],
    ["The wizard's tower", [
      ['Open the door', `Hit the wizard ${WIZARD_CHARGES} times: the door opens for ${TIMING.DOOR_OPEN} seconds.`],
      ['Hurry-up', `Get in fast: the open tower is worth ${fmt(MODES.HURRY_START)}, falling to ${fmt(MODES.HURRY_END)}, on top of the ${fmt(SCORE.TOWER_ENTRY)} entry.`],
      ['Lock and multiball', `The first ${MODES.LOCKS} times you get in, a ball is <b>locked</b> in the tower and a new one comes to the plunger. The next time starts a ${TIMING.MULTIBALL}-second multiball. Every hit on the door during multiball is a <b>Super Jackpot</b> (${fmt(SCORE.SUPER_JACKPOT)}).`],
      ['Add-a-Ball', `During multiball, the mystery hole adds one more ball and ${MODES.ADD_A_BALL_TIME} seconds.`],
    ]],
    ['Combos and jackpots', [
      ['RUSH COMBO', `Hit all three mushrooms, both crystals and the potion: everything scores x2 for ${TIMING.RUSH} seconds.`],
      ['Combo chain', 'Ramps, loops and targets hit in quick succession build COMBO x2, x3… each worth more.'],
      ['Crystal Jackpot', `Hit the two crystals alternately ${TUNE.CRYSTAL_SEQ} times, then ride the crystal ramp.`],
      ['Double Orbit', `Ride the crystal ramp and the golden ramp within ${TUNE.DOUBLE_ORBIT_WINDOW} seconds of each other.`],
      ['Spore Frenzy', `${TUNE.FRENZY_HITS} mushroom hits make the mushrooms worth x${MODES.FRENZY_MULT} for ${MODES.FRENZY_SECONDS} seconds.`],
      ['Magic pool', `Every pass fills the potion. After ${TUNE.POOL_PASSES} passes the pool glows: the next pass collects the <b>Pool Jackpot</b> (from ${fmt(MODES.POOL_JACKPOT)}, growing).`],
    ]],
    ['The mystery hole', [
      ['Mystery award', 'The hole between mushrooms 1 and 2 catches a slow ball and gives a surprise: points, kickbacks, ball save, double scoring, a wizard charge – rarely an Extra Ball.'],
      ['Extra Ball', 'Lit by a second RUSH COMBO, by reaching chapter 3, or by the mystery. Shoot the hole to collect it: you play the same ball again.'],
    ]],
    ['Lanes and bonus', [
      [LANES.join('-'), 'The four lanes beside the flippers light the letters. Every flipper press moves the lit letters. Light all four to raise the bonus multiplier (up to x5).'],
      ['Match', 'At the end of the game a number is drawn. If it matches the tens digit of your score, you get one more ball.'],
      ['End-of-ball bonus', 'When a ball is lost, everything you hit with it is counted and multiplied by the bonus multiplier. A tilted ball pays nothing.'],
    ]],
    ['Chapters and the saga', [
      ['Chapters', `${ch[0]} → ${ch[1]} at ${fmt(STAGES[1].min)} → ${ch[2]} at ${fmt(STAGES[2].min)}. Each chapter scores more (x${STAGES.map((s) => s.mult.toFixed(1)).join(', x')}).`],
      ['Chapter missions', MODES.MISSIONS.map((m, i) => `Chapter ${i + 1}: <b>${m.name}</b> – ${m.text.toLowerCase()} (${fmt(m.award)})`).join('<br>')],
      ["Dragon's Fire", `Reach chapter 3, play a multiball and a RUSH COMBO in the same saga, then shoot the mystery hole. For ${MODES.DRAGON_SECONDS} seconds ten targets burn: each is a jackpot once; put them all out for a wave bonus. Then the saga starts again on the next level – worth more.`],
    ]],
    ['Saving the ball', [
      ['Ball save', `A ball lost within ${TIMING.BALL_SAVE} seconds of the launch comes back.`],
      ['Kickbacks', 'Both outlanes have a kickback that fires the ball back up once. The potion relights them.'],
    ]],
    ['Every day', [
      ['Table stars', 'Five milestones that stay with the table: 50,000 points, the multiball, chapter 3, Dragon\'s Fire, and defeating the dragon.'],
      ['Journal', 'Three new missions every day (finish all three to grow your streak), achievements, your best scores and the saga map. Open it from the pause menu, or with the pause button between games.'],
    ]],
  ];
}

export class HelpCard {
  constructor() {
    const el = document.createElement('section');
    el.className = 'overlay help hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'How to play');
    el.innerHTML = `<div class="card help-card">
      <header class="card-head"><h2>How to play</h2><button class="icon-btn" data-a="close" aria-label="Close">✕</button></header>
      <div class="help-body"></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-a="close"]') || e.target === el) this.show(false);
    });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (on) {
      const body = this.el.querySelector('.help-body');
      body.innerHTML = sections().map(([title, items]) => `
        <section><h3>${title}</h3><dl>${items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>`).join(''); // built on open: always today's values
      body.scrollTop = 0; this.el.querySelector('[data-a="close"]').focus({ preventScroll: true }); }
  }
}
