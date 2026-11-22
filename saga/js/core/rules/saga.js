// Rules module – Chapter missions and Dragon's Fire (the wizard mode that levels the saga up).
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from '../config.js';
import { T, fmt, MYSTERY_TOTAL } from './ticks.js';

export class SagaRules {
  // ---------------------------------------------------------------- chapter missions
  _missionStep(kind, key = null) {
    const m = this.mission;
    if (m.done || m.id !== kind) return;
    if (key !== null) { if (m.seen.has(key)) return; m.seen.add(key); }
    m.progress = Math.min(m.n, m.progress + 1);
    this.bus.emit('missionProgress', { id: m.id, progress: m.progress, n: m.n });
    if (m.progress >= m.n) {
      m.done = true;
      const points = this.award(m.award, 'chapterMission');
      this.bus.emit('chapterMission', { id: m.id, name: m.name, points });
    }
  }

  // ---------------------------------------------------------------- Dragon's Fire (wizard mode)
  _checkDragon() {
    if (this.dragonReady || this.dragonActive) return;
    if (this.flags.chapter3 && this.flags.multiball && this.flags.rush) {
      this.dragonReady = true;
      this.bus.emit('dragonReady', {});
    }
  }

  _startDragon() {
    this.dragonReady = false;
    this.dragonTicks = T.DRAGON;
    this.dragonJackpots = 0;
    this.dragonWaves = 0;
    this.dragonValue = MODES.DRAGON_JACKPOT;
    this.dragonLit = new Set(this.dragonTargets);
    this.bus.emit('dragonStart', { seconds: MODES.DRAGON_SECONDS });
  }

  /** a hit while Dragon's Fire burns: a lit target is a jackpot and goes out; all out = a wave, then they relight */
  _dragonHit(id, x = null, y = null) {
    if (!this.dragonActive || !this.dragonLit.has(id)) return;
    this.dragonLit.delete(id);
    this.dragonJackpots++;
    const points = this.award(this.dragonValue, 'dragonJackpot', x, y);
    this.bus.emit('dragonJackpot', { id, count: this.dragonJackpots, left: this.dragonLit.size, points, x, y });
    if (this.dragonLit.size === 0) {
      this.dragonWaves++;
      const wave = this.award(MODES.DRAGON_WAVE, 'dragonWave');
      this.dragonValue += MODES.DRAGON_STEP;
      this.dragonLit = new Set(this.dragonTargets);
      this.bus.emit('dragonWave', { wave: this.dragonWaves, points: wave });
    }
  }

  _endDragon(completed) {
    const jackpots = this.dragonJackpots;
    this.dragonTicks = 0;
    this.dragonLit = new Set();
    if (!completed) { this.dragonReady = true; this.bus.emit('dragonEnd', { completed: false, jackpots }); return; } // lost the ball: shoot the scoop again
    const victory = this.dragonWaves >= 1; // cleared every target at least once
    if (victory) this.award(MODES.DRAGON_COMPLETE, 'dragonDefeated');
    // the saga starts again on the next level
    this.level++;
    this.levelBase = this.score;
    this.stageIndex = 0;
    this.flags = { chapter3: false, multiball: false, rush: false };
    this._startMission();
    this.bus.emit('dragonEnd', { completed: true, victory, jackpots, waves: this.dragonWaves, level: this.level });
    this.bus.emit('stage', { index: 0, stage: STAGES[0], level: this.level });
  }
}
