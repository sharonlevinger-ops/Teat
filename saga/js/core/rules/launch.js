// Rules module – Plunger, skill shots (normal + super) and nudge / tilt.
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from '../config.js';
import { T, fmt, MYSTERY_TOTAL } from './ticks.js';

export class LaunchRules {
  // ---------------------------------------------------------------- plunger / skill shot
  /** The player released the plunger. Returns true when the skill shot is armed. */
  onLaunch(leftHeld = false) {
    if (leftHeld && this.skillAvailable) { // holding the left flipper: go for the Super Skill Shot instead
      this.skillAvailable = false;
      this.skillArmed = false;
      this.superArmed = true;
      this.superTicks = T.SUPER;
      this.bus.emit('superSkillArmed', { seconds: MODES.SUPER_SKILL_WINDOW });
      return false;
    }
    const armed = this.skillLit;
    this.skillAvailable = false; // only the first launch of each served ball can be a skill shot
    this.skillArmed = armed;
    this.skillTicks = armed ? T.SKILL_TIMEOUT + secToTicks(3) : 0;
    return armed;
  }

  /** Ball reached the top of the shooter lane. Returns true when the table should steer it to the skill target. */
  onShooterExit() {
    if (!this.saveStarted && !this.multiball) { // Ball Save starts when the served ball reaches the playfield
      this.saveStarted = true;
      this.saveTicks = Math.max(this.saveTicks, T.SAVE);
      this.bus.emit('ballSaveStart', { seconds: TIMING.BALL_SAVE });
    }
    if (!this.skillArmed) return false;
    this.skillTicks = T.SKILL_TIMEOUT + secToTicks(2); // time to come round the top of the table
    return true;
  }

  onSkillTurn() { if (this.skillArmed) this.bus.emit('skillRedirect', {}); }

  onBallHeld() { this.skillArmed = false; }

  // ---------------------------------------------------------------- nudge / tilt
  /** The player shoved the table. Returns true when the nudge happens (the table then pushes the balls). */
  onNudge() {
    if (this.state !== 'playing' || this.tilted || this.nudgeCd > 0) return false;
    this.nudgeCd = T.NUDGE_CD;
    this.danger += 1;
    this.bus.emit('nudge', { danger: this.danger });
    if (this.danger >= TILT.LIMIT) {
      this.danger = 0;
      this.tiltWarnings++;
      if (this.tiltWarnings > TILT.WARNINGS) this._tilt();
      else this.bus.emit('tiltWarning', { count: this.tiltWarnings, of: TILT.WARNINGS });
    }
    return true;
  }

  _tilt() {
    this.tilted = true;
    this.kickLit.L = this.kickLit.R = false;
    this.saveTicks = 0;
    this.ctl.tiltFlippers();
    this.bus.emit('kickback', { lit: false });
    this.bus.emit('tilt', {});
  }
}
