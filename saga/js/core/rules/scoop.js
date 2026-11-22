// Rules module – The Mystery Scoop: extra ball, Add-a-Ball, mystery awards, and the end-of-game Match.
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from '../config.js';
import { T, fmt, MYSTERY_TOTAL } from './ticks.js';

export class ScoopRules {
  // ---------------------------------------------------------------- extra ball
  _lightExtra(source) {
    this.extraLit++;
    this.bus.emit('extraBallLit', { source });
  }

  /** Mystery Scoop: Dragon's Fire when ready, else a lit Extra Ball, else a mystery award. */
  onScoop() {
    if (this.state !== 'playing') return;
    this.award(MODES.SCOOP_BASE, 'scoop');
    this._bonus('scoop');
    if (this.tilted) return;
    if (this.dragonReady) { this._startDragon(); return; }
    if (this.extraLit > 0) {
      this.extraLit--;
      this.extraBalls++;
      this.bus.emit('extraBall', { pending: this.extraBalls });
      return;
    }
    if (this.multiball && this.addBallUsed < MODES.ADD_A_BALL_MAX && this.ctl.activeBallCount() < this.ctl.maxBalls) { // Add-a-Ball
      this.addBallUsed++;
      this.mbTicks += T.ADD_TIME;
      this.award(MODES.ADD_A_BALL_POINTS, 'addABall');
      this.ctl.addBall();
      this.bus.emit('addABall', { seconds: MODES.ADD_A_BALL_TIME });
      return;
    }
    this._mystery();
  }

  _mystery() {
    let r = this.ctl.rand() * MYSTERY_TOTAL, pick = MODES.MYSTERY[0][1];
    for (const [w, id] of MODES.MYSTERY) { if ((r -= w) < 0) { pick = id; break; } }
    // awards that make no sense right now turn into points
    if (pick === 'kickbacks' && this.kickLit.L && this.kickLit.R) pick = 'points5k';
    if (pick === 'ballSave' && this.multiball) pick = 'points10k';
    if (pick === 'boost' && (this.rushActive || this.boostActive)) pick = 'points10k';
    if (pick === 'wizard' && (this.multiball || this.doorOpen)) pick = 'points5k';
    if (pick === 'extraBall' && this.extraFrom.mystery) pick = 'points10k';
    let label;
    switch (pick) {
      case 'points5k': label = `+${fmt(this.award(5000, 'mystery'))}`; break;
      case 'points10k': label = `+${fmt(this.award(10000, 'mystery'))}`; break;
      case 'points25k': label = `BIG POINTS +${fmt(this.award(25000, 'mystery'))}`; break;
      case 'kickbacks': this.kickLit.L = this.kickLit.R = true; this.bus.emit('kickback', { lit: true }); label = 'KICKBACKS LIT'; break;
      case 'ballSave': this.saveTicks = Math.max(this.saveTicks, T.MYSTERY_SAVE); label = `BALL SAVE ${MODES.MYSTERY_SAVE}s`; break;
      case 'boost': this.boostTicks = T.BOOST; this.bus.emit('boostStart', { seconds: MODES.BOOST_SECONDS }); label = `DOUBLE SCORING ${MODES.BOOST_SECONDS}s`; break;
      case 'wizard': this._chargeWizard(); label = 'WIZARD CHARGE +1'; break;
      case 'extraBall': this.extraFrom.mystery = true; this._lightExtra('mystery'); label = 'EXTRA BALL LIT'; break;
      default: label = '';
    }
    this.bus.emit('mystery', { award: pick, label });
  }

  /** Match: a number 00–90 is drawn against the tens digit of the score (10 % chance). Once per game. */
  _match() {
    this.matchDone = true;
    const number = Math.floor(this.ctl.rand() * 10) * 10;
    const digit = (Math.floor(this.score / 10) % 10) * 10;
    const won = number === digit;
    this.bus.emit('match', { number, digit, won });
    return won;
  }
}
