// Rules module – Ramps (Crystal Jackpot, Double Orbit, Super Skill Shot), loops and the magic pool.
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from '../config.js';
import { T, fmt, MYSTERY_TOTAL } from './ticks.js';

export class ShotRules {
  onRamp(id) {
    this.award(SCORE.RAMP, id);
    this._bonus('ramp');
    this.bus.emit('ramp', { id });
    this._chainHit();
    this._dragonHit(id);
    this._missionStep('moon');
    if (id === 'rampB' && this.superArmed) { // Super Skill Shot
      this.superArmed = false;
      this.superTicks = 0;
      const points = this.award(MODES.SUPER_SKILL, 'superSkillShot');
      this.bus.emit('superSkillShot', { points });
    }
    if (id === 'rampA' && this.crystalLit) { // Crystal Jackpot (lit by alternating the crystals)
      this.crystalLit = false;
      const points = this.award(this.crystalValue, 'crystalJackpot');
      this.crystalValue = Math.min(MODES.CRYSTAL_MAX, this.crystalValue + MODES.CRYSTAL_STEP);
      this.bus.emit('crystalJackpot', { points });
    }
    // Double Orbit: the crystal ramp and the golden ramp back to back (either order)
    const lr = this.lastRamp;
    if (lr && lr.id !== id && this.tick - lr.tick <= secToTicks(TUNE.DOUBLE_ORBIT_WINDOW)) {
      this.lastRamp = null;
      const points = this.award(this.doubleOrbitValue, 'doubleOrbit');
      this.doubleOrbitValue = Math.min(MODES.DOUBLE_ORBIT_MAX, this.doubleOrbitValue + MODES.DOUBLE_ORBIT_STEP);
      this.bus.emit('doubleOrbit', { points });
    } else this.lastRamp = { id, tick: this.tick };
  }

  onOrbit(ball, side, vy) {
    if (vy > 0) { this.loopStart.set(ball.id, { side, tick: this.tick }); return; }
    const s = this.loopStart.get(ball.id);
    if (s && s.side !== side && this.tick - s.tick <= T.LOOP) {
      this.loopStart.delete(ball.id);
      this.award(SCORE.LOOP, 'loop');
      this._bonus('loop');
      this.bus.emit('loop', { side });
      this._chainHit();
    }
  }

  /** Magic pool: every pass fills the potion; the 6th pass after it is full collects the Pool Jackpot. */
  onPool() {
    if (this.state !== 'playing' || !this._cool('pool', T.POOL_CD)) return;
    this.award(MODES.POOL_PASS, 'pool');
    this._bonus('pool');
    if (this.poolLit) {
      this.poolLit = false;
      this.poolCharge = 0;
      const points = this.award(this.poolValue, 'poolJackpot');
      this.poolValue = Math.min(MODES.POOL_MAX, this.poolValue + MODES.POOL_STEP);
      this.bus.emit('poolJackpot', { points });
      return;
    }
    this.poolCharge = Math.min(TUNE.POOL_PASSES, this.poolCharge + 1);
    this.bus.emit('poolCharge', { charge: this.poolCharge, of: TUNE.POOL_PASSES });
    if (this.poolCharge >= TUNE.POOL_PASSES) { this.poolLit = true; this.bus.emit('poolLit', { value: this.poolValue }); }
  }
}
