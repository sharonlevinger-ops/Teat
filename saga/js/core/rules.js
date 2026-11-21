// Game rules: scoring, chapters, modes, ball flow. No physics math and no rendering.
// Talks to the table only through the `ctl` interface (implemented by Simulation) and reports
// everything to the presentation layer through the EventBus.
//
// All timers are integer tick counters at the fixed simulation rate, so "30 seconds" is exactly 3600 ticks.

import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX,
} from './config.js';

const T = {
  RUSH: secToTicks(TIMING.RUSH),
  DOOR: secToTicks(TIMING.DOOR_OPEN),
  MB: secToTicks(TIMING.MULTIBALL),
  SKILL_PERIOD: secToTicks(TIMING.SKILL_PERIOD),
  SKILL_LIT: secToTicks(TIMING.SKILL_LIT),
  SKILL_TIMEOUT: secToTicks(TIMING.SKILL_TIMEOUT),
  ELEMENT_CD: secToTicks(TIMING.ELEMENT_COOLDOWN),
  FLIPPER_CD: secToTicks(TIMING.FLIPPER_SCORE_COOLDOWN),
  DOOR_CD: secToTicks(TIMING.DOOR_HIT_COOLDOWN),
  LOOP: secToTicks(TIMING.LOOP_WINDOW),
  COMBO: secToTicks(TIMING.COMBO_WINDOW),
  SERVE_DELAY: secToTicks(1.4),
  SAVE: secToTicks(TIMING.BALL_SAVE),
};
export const RULE_TICKS = T;

export class GameRules {
  constructor(bus, ctl) {
    this.bus = bus;
    this.ctl = ctl;
    this.highScore = 0;
    this.state = 'attract'; // attract | playing | gameover
    this._resetValues();
  }

  _resetValues() {
    this.tick = 0;
    this.score = 0;
    this.ball = 1;
    this.stageIndex = 0;
    this.guests = 0;
    this.rushTicks = 0;
    this.combo = new Set();
    this.wizardCharge = 0;
    this.doorTicks = 0;
    this.multiball = false;
    this.mbTicks = 0;
    this.kickLit = { L: true, R: true }; // a kickback on each outlane
    this.skillAvailable = false;
    this.skillArmed = false;
    this.skillTicks = 0;
    this.skillPhase = 0;
    this.serveTicks = 0;
    this.cooldowns = new Map();
    this.loopStart = new Map();
    this.lastAward = null;
    this.chain = 0;
    this.chainTicks = 0;
    this.saveTicks = 0;
    this.saveStarted = false;
  }

  // ---------------------------------------------------------------- derived state
  get stage() { return STAGES[this.stageIndex]; }
  get rushActive() { return this.rushTicks > 0; }
  get kickbackLit() { return this.kickLit.L; }
  get doorOpen() { return this.doorTicks > 0; }
  get multiplier() { return this.stage.mult * (this.rushActive ? RUSH_MULT : 1); }
  get ballSaveActive() { return this.saveTicks > 0; }

  /** What the player should go for right now (shown under the table, with an arrow on the target). */
  get goal() {
    if (this.state !== 'playing') return null;
    let text, target;
    if (this.multiball) { text = 'SHOOT THE TOWER DOOR · SUPER JACKPOT'; target = 'door'; }
    else if (this.doorOpen) { text = 'SHOOT INTO THE OPEN TOWER!'; target = 'door'; }
    else {
      const left = WIZARD_CHARGES - this.wizardCharge;
      text = left === 1 ? 'WIZARD · 1 MORE HIT OPENS THE TOWER' : `WIZARD · ${left} MORE HITS OPEN THE TOWER`;
      target = 'wizard';
    }
    const next = STAGES[this.stageIndex + 1];
    const sub = next ? `CHAPTER ${next.id} IN ${(next.min - this.score).toLocaleString('en-US')}` : 'FINAL CHAPTER';
    return { text, target, sub };
  }

  get skillLit() { return this.skillAvailable && this.skillPhase % T.SKILL_PERIOD < T.SKILL_LIT; }

  // ---------------------------------------------------------------- flow
  startGame() {
    this._resetValues();
    this.state = 'playing';
    this.ctl.resetTable();
    this.bus.emit('gameStart', {});
    this.bus.emit('stage', { index: 0, stage: STAGES[0], initial: true });
    this._serve();
  }

  _serve() {
    this.ctl.serveBall();
    this.skillAvailable = true;
    this.skillArmed = false;
    this.skillPhase = 0;
    this.kickLit.L = this.kickLit.R = true;
    this.saveTicks = 0;
    this.saveStarted = false;
    this.bus.emit('ballServed', { ball: this.ball });
    this.bus.emit('kickback', { lit: true });
  }

  /** Award points: base × chapter multiplier × RUSH multiplier. A chapter change applies from the next award. */
  award(base, reason, x = null, y = null) {
    if (this.state !== 'playing') return 0;
    const mult = this.multiplier;
    const points = Math.round(base * mult);
    this.score += points;
    this.lastAward = { base, mult, points, reason };
    this.bus.emit('score', { points, base, mult, reason, total: this.score, x, y });
    this._checkStage();
    return points;
  }

  _checkStage() {
    let idx = this.stageIndex;
    for (let i = this.stageIndex + 1; i < STAGES.length; i++) if (this.score >= STAGES[i].min) idx = i;
    if (idx !== this.stageIndex) {
      this.stageIndex = idx;
      this.bus.emit('stage', { index: idx, stage: STAGES[idx] });
    }
  }

  _cool(key, ticks) {
    const until = this.cooldowns.get(key);
    if (until !== undefined && this.tick < until) return false;
    this.cooldowns.set(key, this.tick + ticks);
    return true;
  }

  /** Called once per fixed simulation step. */
  update() {
    if (this.state !== 'playing') return;
    this.tick++;
    this.skillPhase++;

    if (this.serveTicks > 0 && --this.serveTicks === 0) this._serve();

    if (this.rushTicks > 0 && --this.rushTicks === 0) this.bus.emit('rushEnd', {});

    if (this.doorTicks > 0 && --this.doorTicks === 0) {
      this.ctl.setDoor(false);
      this.wizardCharge = 0;
      this.bus.emit('doorClose', { entered: false });
      this.bus.emit('wizardCharge', { charge: 0 });
    }

    if (this.multiball && --this.mbTicks <= 0) this._endMultiball('timeout');

    if (this.skillArmed && --this.skillTicks <= 0) this.skillArmed = false;

    if (this.saveTicks > 0 && --this.saveTicks === 0) this.bus.emit('ballSaveEnd', {});

    if (this.chainTicks > 0 && --this.chainTicks === 0) {
      if (this.chain >= 2) this.bus.emit('comboChainEnd', { level: this.chain });
      this.chain = 0;
    }
  }

  /** Combo Chain: ramps, loops and elements hit in quick succession build x2, x3… with a growing bonus. */
  _chainHit(x = null, y = null) {
    this.chain = this.chainTicks > 0 ? Math.min(COMBO_MAX, this.chain + 1) : 1;
    this.chainTicks = T.COMBO;
    if (this.chain >= 2) {
      this.award(SCORE.COMBO_CHAIN * (this.chain - 1), 'comboChain', x, y);
      this.bus.emit('comboChain', { level: this.chain });
    }
  }

  // ---------------------------------------------------------------- plunger / skill shot
  /** The player released the plunger. Returns true when the skill shot is armed. */
  onLaunch() {
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
      this.saveTicks = T.SAVE;
      this.bus.emit('ballSaveStart', { seconds: TIMING.BALL_SAVE });
    }
    if (!this.skillArmed) return false;
    this.skillTicks = T.SKILL_TIMEOUT + secToTicks(2); // time to come round the top of the table
    return true;
  }

  onSkillTurn() { if (this.skillArmed) this.bus.emit('skillRedirect', {}); }

  onBallHeld() { this.skillArmed = false; }

  // ---------------------------------------------------------------- table events
  onFlipperHit(ball) {
    if (this._cool('flip' + ball.id, T.FLIPPER_CD)) this.award(SCORE.FLIPPER, 'flipper');
  }

  onElementHit(id, x, y) {
    if (!this._cool(id, T.ELEMENT_CD)) return;
    if (this.skillArmed && id === SKILL_TARGET) {
      this.skillArmed = false;
      this.award(SCORE.SKILL_SHOT, 'skillShot', x, y);
      this.bus.emit('skillShot', { x, y });
    }
    this.award(SCORE.ELEMENT, id, x, y);
    this.bus.emit('element', { id, x, y });
    this._chainHit(x, y);
    if (id === 'potion' && !(this.kickLit.L && this.kickLit.R)) { // the potion relights both kickbacks
      this.kickLit.L = this.kickLit.R = true;
      this.bus.emit('kickback', { lit: true });
    }
    if (!this.rushActive && RUSH_ELEMENTS.includes(id) && !this.combo.has(id)) {
      this.combo.add(id);
      this.bus.emit('comboProgress', { ids: [...this.combo], count: this.combo.size });
      if (this.combo.size === RUSH_ELEMENTS.length) this._startRush();
    }
  }

  _startRush() {
    this.combo.clear();
    this.rushTicks = T.RUSH;
    this.bus.emit('rushStart', { seconds: TIMING.RUSH });
    this.bus.emit('comboProgress', { ids: [], count: 0 });
  }

  onSlingHit(id, x, y) {
    if (!this._cool(id, T.ELEMENT_CD)) return;
    this.award(SCORE.SLING, 'sling', x, y);
  }

  onWizardHit(x, y) {
    if (!this._cool('wizard', T.ELEMENT_CD)) return;
    this.award(SCORE.WIZARD, 'wizard', x, y);
    if (this.multiball || this.doorOpen) { this.bus.emit('wizardHit', { charge: this.wizardCharge }); return; }
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
        this.award(SCORE.SUPER_JACKPOT, 'superJackpot', x, y);
        this.bus.emit('superJackpot', { x, y });
      }
    } else {
      this.bus.emit('doorThud', {});
    }
  }

  onTowerEnter(ball) {
    if (!this.doorOpen || this.multiball) { this.ctl.ejectFromTower(ball, 0.6); return; }
    this.doorTicks = 0;
    this.ctl.setDoor(false);
    this.wizardCharge = 0;
    this.guests++;
    this.bus.emit('doorClose', { entered: true });
    this.bus.emit('wizardCharge', { charge: 0 });
    this.bus.emit('towerEnter', {});
    this.award(SCORE.TOWER_ENTRY, 'towerEntry');
    this.multiball = true;
    this.mbTicks = T.MB;
    this.ctl.startMultiball(ball);
    this.bus.emit('multiballStart', { seconds: TIMING.MULTIBALL });
  }

  _endMultiball(reason) {
    if (!this.multiball) return;
    this.multiball = false;
    this.mbTicks = 0;
    if (reason === 'timeout') this.ctl.removeExtraBalls();
    this.bus.emit('multiballEnd', { reason });
  }

  onRamp(id) {
    this.award(SCORE.RAMP, id);
    this.bus.emit('ramp', { id });
    this._chainHit();
  }

  onOrbit(ball, side, vy) {
    if (vy > 0) { this.loopStart.set(ball.id, { side, tick: this.tick }); return; }
    const s = this.loopStart.get(ball.id);
    if (s && s.side !== side && this.tick - s.tick <= T.LOOP) {
      this.loopStart.delete(ball.id);
      this.award(SCORE.LOOP, 'loop');
      this.bus.emit('loop', { side });
      this._chainHit();
    }
  }

  onOutlane(ball, side) {
    if (this.kickLit[side]) {
      this.kickLit[side] = false;
      this.ctl.kickback(ball, side);
      this.bus.emit('kickback', { lit: false, fired: true, side });
    } else {
      this.bus.emit('outlane', { side });
    }
  }

  onDrain(ball) {
    this.ctl.removeBall(ball);
    if (this.state !== 'playing') return;
    const left = this.ctl.activeBallCount();
    if (this.multiball) {
      if (left <= 1) this._endMultiball('drained');
      if (left === 0) this.serveTicks = T.SERVE_DELAY; // all multiball balls gone: back to a normal ball
      this.bus.emit('drain', { left, multiball: true });
      return;
    }
    this.bus.emit('drain', { left, multiball: false });
    if (left > 0 || this.serveTicks > 0) return;
    if (this.saveTicks > 0) { // Ball Save: the ball comes straight back, nothing is lost (once per ball)
      this.saveTicks = 0;
      this.skillAvailable = false;
      this.ctl.serveBall();
      this.bus.emit('ballSaved', {});
      return;
    }
    // lost the ball
    this.chain = 0; this.chainTicks = 0;
    if (this.rushActive) { this.rushTicks = 0; this.bus.emit('rushEnd', {}); }
    if (this.doorOpen) {
      this.doorTicks = 0;
      this.ctl.setDoor(false);
      this.wizardCharge = 0;
      this.bus.emit('doorClose', { entered: false });
      this.bus.emit('wizardCharge', { charge: 0 });
    }
    if (this.ball < BALLS_PER_GAME) {
      this.ball++;
      this.serveTicks = T.SERVE_DELAY;
      this.bus.emit('ballLost', { nextBall: this.ball });
    } else {
      this.state = 'gameover';
      const newHigh = this.score > this.highScore;
      if (newHigh) this.highScore = this.score;
      this.bus.emit('gameOver', { score: this.score, high: this.highScore, newHigh });
    }
  }
}
