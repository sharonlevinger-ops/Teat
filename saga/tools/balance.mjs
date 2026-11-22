// Balance report: a bot plays the real table (physics + rules) and counts how often every feature happens.
// The bot flips with a human-like timing spread; numbers are per 10 minutes of ball-in-play time.
// Usage: node saga/tools/balance.mjs [minutes=30] [spread=0.6]
import { Simulation } from '../../tests/helpers/saga-sim.mjs';
import { botFlippers } from '../../tests/helpers/pinball-bot.mjs';
import { HZ } from '../js/core/config.js';

const minutes = Number(process.argv[2] || 30), spread = Number(process.argv[3] || 0.6);
const sim = new Simulation();
const c = {}; sim.bus.on('*', (t) => { c[t] = (c[t] || 0) + 1; });
let seed = 4242; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hold = { L: 0, R: 0, cdL: 0, cdR: 0 }; let pull = 0;
const scores = [];
sim.rules.startGame();
sim.bus.on('gameOver', ({ score }) => scores.push(score));
for (let i = 0; i < minutes * 60 * HZ; i++) {
  if (sim.rules.state !== 'playing') sim.rules.startGame();
  botFlippers(sim, hold, rnd, spread);
  if (sim.heldBall() && sim.canLaunch()) { if (!sim.plunger.pulling) { sim.pressLaunch(); pull = 20 + Math.floor(rnd() * 100); } else if (--pull <= 0) sim.releaseLaunch(); }
  sim.step();
}
const per10 = (k) => ((c[k] || 0) * 10 / minutes).toFixed(1);
const rows = [
  ['Balls lost', 'ballLost'], ['Ball saves', 'ballSaved'], ['Kickbacks', 'kickbackFire'],
  ['Wizard hits', 'wizardHit'], ['Tower opened', 'doorOpen'], ['Ball locks', 'ballLock'], ['Multiballs', 'multiballStart'],
  ['RUSH combos', 'rushStart'], ['Spore Frenzy', 'frenzyStart'], ['Scoop catches', 'scoopCapture'], ['Mystery awards', 'mystery'],
  ['Pool jackpots', 'poolJackpot'], ['Crystal jackpots', 'crystalJackpot'], ['Double orbits', 'doubleOrbit'],
  ['M-A-G-E completed', 'lanesComplete'], ['Ramps ridden', 'ramp'], ['Loops', 'loop'], ['Chapter missions', 'chapterMission'],
  ['Extra balls won', 'extraBall'], ["Dragon's Fire", 'dragonStart'], ['Tilts', 'tilt'], ['Stuck-ball rescues', 'ballRescue'],
];
console.log(`Balance report – ${minutes} min of bot play (timing spread ${spread}), counts per 10 minutes`);
for (const [label, k] of rows) console.log(`  ${label.padEnd(20)} ${per10(k).padStart(7)}`);
if (scores.length) console.log(`  games finished: ${scores.length}, scores: ${scores.map((s) => s.toLocaleString('en-US')).join(', ')}`);
else console.log('  (no game ended: the bot kept the ball alive the whole time)');
