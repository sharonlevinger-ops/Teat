// Rules module – The wizard, the tower door, ball locks, multiball and the hurry-up.
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from '../config.js';
import { T, fmt, MYSTERY_TOTAL } from './ticks.js';

export class TowerRules {
  onWizardHit(x, y) {
    if (!this._cool('wizard', T.ELEMENT_CD)) return;
    this.award(SCORE.WIZARD, 'wizard', x, y);
    this._bonus('wizard');
    this._dragonHit('wizard', x, y);
    if (this.multiball || this.doorOpen) { this.bus.emit('wizardHit', { charge: this.wizardCharge }); return; }
    this._chargeWizard();
  }

  _chargeWizard() {
    this.wizardCharge = Math.min(WIZARD_CHARGES, this.wizardCharge + 1);
    this.bus.emit('wizardHit', { charge: this.wizardCharge });
    this.bus.emit('wizardCharge', { charge: this.wizardCharge });
    if (this.wizardCharge >= WIZARD_CHARGES) {
      this.doorTicks = T.DOOR;
      this.ctl.setDoor(true);
      this.award(SCORE.DOOR_OPEN, 'doorOpen');
      this.bus.emit('doorOpen', { seconds: TIMING.DOOR_OPEN });
    }
  }

  onDoorHit(x, y) {
    if (this.multiball) {
      if (this._cool('door', T.DOOR_CD)) {
        this._missionStep('dragon');
        this.award(SCORE.SUPER_JACKPOT, 'superJackpot', x, y);
        this.bus.emit('superJackpot', { x, y });
        this._dragonHit('tower', x, y);
      }
    } else if (this._cool('doorThud', T.DOOR_CD)) {
      this.bus.emit('doorThud', {});
      this._missionStep('dragon');
      this._dragonHit('tower', x, y);
    }
  }

  onTowerEnter(ball) {
    if (!this.doorOpen || this.multiball) { this.ctl.ejectFromTower(ball, 0.6); return; }
    const hurry = this.hurryValue;
    this.doorTicks = 0;
    this.ctl.setDoor(false);
    this.wizardCharge = 0;
    this.guests++;
    this.bus.emit('doorClose', { entered: true });
    this.bus.emit('wizardCharge', { charge: 0 });
    this._missionStep('dragon'); // counts for the chapter it happened in (before the points can change the chapter)
    this._dragonHit('tower');
    if (this.locks < MODES.LOCKS) { // lock the ball in the tower; a new ball comes to the plunger
      this.locks++;
      this.award(MODES.LOCK_POINTS, 'lock');
      const hpl = this.award(hurry, 'hurryUp');
      this.bus.emit('hurryUp', { points: hpl });
      this.ctl.lockBall(ball);
      this.lockServeTicks = T.LOCK_RELAUNCH;
      this.bus.emit('ballLock', { count: this.locks, of: MODES.LOCKS });
      return;
    }
    this.locks = 0;
    this.addBallUsed = 0;
    this.bus.emit('towerEnter', {});
    this.award(SCORE.TOWER_ENTRY, 'towerEntry');
    const hp = this.award(hurry, 'hurryUp');
    this.bus.emit('hurryUp', { points: hp });
    this.multiball = true;
    this.flags.multiball = true;
    this.mbTicks = T.MB;
    this.ctl.startMultiball(ball);
    this.bus.emit('multiballStart', { seconds: TIMING.MULTIBALL });
    this._checkDragon();
  }

  _endMultiball(reason) {
    if (!this.multiball) return;
    this.multiball = false;
    this.mbTicks = 0;
    if (reason === 'timeout') this.ctl.removeExtraBalls();
    this.bus.emit('multiballEnd', { reason });
  }
}
