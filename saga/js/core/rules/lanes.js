// Rules module – The M-A-G-E lanes and the bonus multiplier.
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from '../config.js';
import { T, fmt, MYSTERY_TOTAL } from './ticks.js';

export class LaneRules {
  // ---------------------------------------------------------------- lanes (M-A-G-E) and bonus multiplier
  /** A flipper press moves the lit lane letters (lane change), like a real table. */
  onFlipperPress(side) {
    if (this.state !== 'playing' || this.tilted) return;
    const l = this.lanes;
    this.lanes = side === 'L' ? [l[1], l[2], l[3], l[0]] : [l[3], l[0], l[1], l[2]];
  }

  /** ball rolled through lane i (0 outlane L, 1 inlane L, 2 inlane R, 3 outlane R) */
  onLane(i) {
    if (this.state !== 'playing' || !this._cool('lane' + i, T.ELEMENT_CD)) return;
    this.bus.emit('rollover', { index: i }); // the lane switch clicks on every pass
    if (!this.lanes[i]) {
      this.lanes[i] = true;
      this.award(MODES.LANE_POINTS, 'lane');
      this._bonus('lane');
      this.bus.emit('laneLit', { index: i, letter: LANES[i] });
    }
    if (this.lanes.every(Boolean)) {
      this.lanes = [false, false, false, false];
      const points = this.award(MODES.LANE_COMPLETE, 'lanesComplete');
      const maxed = this.bonusX >= MODES.BONUS_X_MAX;
      if (!maxed) { this.bonusX++; this.bus.emit('bonusX', { x: this.bonusX }); }
      this.bus.emit('lanesComplete', { points, maxed }); // every completion (missions count it); maxed = points only
    }
  }
}
