// Game rules: scoring, chapters, modes, ball flow. No physics math and no rendering.
// Talks to the table only through the `ctl` interface (implemented by Simulation) and reports
// everything to the presentation layer through the EventBus.
//
// All timers are integer tick counters at the fixed simulation rate, so "30 seconds" is exactly 3600 ticks.

import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES, TUNE,
} from './config.js';
import { T, fmt } from './rules/ticks.js';
import { SagaRules } from './rules/saga.js';
import { ScoopRules } from './rules/scoop.js';
import { LaunchRules } from './rules/launch.js';
import { LaneRules } from './rules/lanes.js';
import { TowerRules } from './rules/tower.js';
import { ShotRules } from './rules/shots.js';

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
    // saga level: after Dragon's Fire the chapters start again, worth more and a little harder to reach
    this.level = 1;
    this.levelBase = 0;
    // per game
    this.rushCount = 0;
    this.extraLit = 0; // extra balls lit at the scoop
    this.extraBalls = 0; // extra balls earned (played after the current ball)
    this.extraFrom = { rush: false, chapter: false, mystery: false };
    this.flags = { chapter3: false, multiball: false, rush: false }; // Dragon's Fire qualification (this level)
    this.dragonReady = false;
    this.dragonTicks = 0;
    this.dragonJackpots = 0;
    this.dragonLit = new Set();
    this.dragonValue = MODES.DRAGON_JACKPOT;
    this.dragonWaves = 0;
    this.boostTicks = 0;
    this.poolCharge = 0;
    this.poolLit = false;
    this.poolValue = MODES.POOL_JACKPOT;
    this.lanes = [false, false, false, false];
    this.mushHits = 0;
    this.frenzyTicks = 0;
    this.crystalSeq = { last: null, count: 0 };
    this.crystalLit = false;
    this.crystalValue = MODES.CRYSTAL_JACKPOT;
    this.lastRamp = null;
    this.doubleOrbitValue = MODES.DOUBLE_ORBIT;
    this.locks = 0; // balls locked in the tower (persist through the game)
    this.lockServeTicks = 0;
    this.addBallUsed = 0;
    this.superArmed = false;
    this.superTicks = 0;
    this.matchDone = false;
    this._resetBallValues();
    this._startMission();
    this._resetTilt();
  }

  /** values that belong to one ball (reset when it is lost) */
  _resetBallValues() {
    this.bonusBase = 0;
    this.bonusX = 1;
  }

  _resetTilt() { this.danger = 0; this.tiltWarnings = 0; this.tilted = false; this.nudgeCd = 0; }

  _startMission() {
    this.mission = { ...MODES.MISSIONS[this.stageIndex], progress: 0, done: false, seen: new Set() };
  }

  // ---------------------------------------------------------------- derived state
  get stage() { return STAGES[this.stageIndex]; }
  get chapterMult() { return this.stage.mult + (this.level - 1) * MODES.LEVEL_STEP; }
  get rushActive() { return this.rushTicks > 0; }
  get boostActive() { return this.boostTicks > 0; }
  get dragonActive() { return this.dragonTicks > 0; }
  get frenzyActive() { return this.frenzyTicks > 0; }
  get kickbackLit() { return this.kickLit.L; }
  get doorOpen() { return this.doorTicks > 0; }
  get multiplier() { return this.chapterMult * (this.rushActive ? RUSH_MULT : 1) * (this.boostActive ? MODES.BOOST_MULT : 1); }
  get ballSaveActive() { return this.saveTicks > 0; }
  /** Hurry-up: the tower is worth more the faster the player gets in (20,000 falling to 5,000). */
  get hurryValue() {
    if (!this.doorOpen) return 0;
    const v = MODES.HURRY_END + (MODES.HURRY_START - MODES.HURRY_END) * (this.doorTicks / T.DOOR);
    return Math.round(v / 100) * 100;
  }

  /** score needed for chapter i on the current saga level */
  stageMin(i) { return this.levelBase + Math.round(STAGES[i].min * (1 + (this.level - 1) * MODES.LEVEL_STEP)); }

  /** What the player should go for right now (shown under the table, with an arrow on the target). */
  get goal() {
    if (this.state !== 'playing') return null;
    let text, target = null;
    if (this.tilted) text = 'TILT · WAIT FOR THE NEXT BALL';
    else if (this.skillAvailable && !this.multiball && this.ctl.heldBall && this.ctl.heldBall()) { text = 'SKILL SHOT · RELEASE ON THE GOLD FLASH'; target = 'mush3'; }
    else if (this.dragonActive) { text = `DRAGON'S FIRE · ${this.dragonLit.size} LIT TARGETS LEFT · WAVE ${this.dragonWaves + 1}`; target = null; }
    else if (this.multiball) { text = 'SHOOT THE TOWER DOOR · SUPER JACKPOT'; target = 'door'; }
    else if (this.superArmed) { text = 'SUPER SKILL SHOT · SHOOT THE GOLDEN RAMP'; target = 'rampB'; }
    else if (this.doorOpen) { text = `SHOOT THE TOWER · ${this.locks < MODES.LOCKS ? `LOCK BALL ${this.locks + 1}` : 'MULTIBALL'} · ${fmt(this.hurryValue)}`; target = 'door'; }
    else if (this.dragonReady) { text = "DRAGON'S FIRE IS READY · SHOOT THE MYSTERY HOLE"; target = 'scoop'; }
    else if (this.extraLit > 0) { text = 'EXTRA BALL IS LIT · SHOOT THE MYSTERY HOLE'; target = 'scoop'; }
    else if (this.crystalLit) { text = `CRYSTAL JACKPOT ${fmt(this.crystalValue)} · RIDE THE CRYSTAL RAMP`; target = 'rampA'; }
    else if (this.poolLit) { text = `POOL JACKPOT ${fmt(this.poolValue)} · ROLL THROUGH THE POOL`; target = 'pool'; }
    else {
      const left = WIZARD_CHARGES - this.wizardCharge;
      text = left === 1 ? 'WIZARD · 1 MORE HIT OPENS THE TOWER' : `WIZARD · ${left} MORE HITS OPEN THE TOWER`;
      target = 'wizard';
    }
    const parts = [];
    if (!this.mission.done) parts.push(`${this.mission.name} ${this.mission.progress}/${this.mission.n}`);
    const nextI = this.stageIndex + 1;
    if (nextI < STAGES.length) parts.push(`CHAPTER ${STAGES[nextI].id} IN ${fmt(this.stageMin(nextI) - this.score)}`);
    else if (!this.dragonActive && !this.dragonReady) parts.push(this.level > 1 ? `FINAL CHAPTER · LEVEL ${this.level}` : 'FINAL CHAPTER');
    return { text, target, sub: parts.join(' · ') };
  }

  get skillLit() { return this.skillAvailable && this.skillPhase % T.SKILL_PERIOD < T.SKILL_LIT; }

  // ---------------------------------------------------------------- flow
  startGame() {
    this._resetValues();
    this.state = 'playing';
    this.ctl.resetTable();
    this.bus.emit('gameStart', {});
    this.bus.emit('stage', { index: 0, stage: STAGES[0], initial: true, level: 1 });
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
    this._resetTilt();
    this.bus.emit('ballServed', { ball: this.ball });
    this.bus.emit('kickback', { lit: true });
  }

  /** Award points: base × chapter multiplier × RUSH × boost. A chapter change applies from the next award. */
  award(base, reason, x = null, y = null) {
    if (this.state !== 'playing' || this.tilted) return 0;
    const mult = this.multiplier;
    const points = Math.round(base * mult);
    this.score += points;
    this.lastAward = { base, mult, points, reason };
    this.bus.emit('score', { points, base, mult, reason, total: this.score, x, y });
    this._checkStage();
    return points;
  }

  _bonus(kind) { if (!this.tilted) this.bonusBase += MODES.BONUS[kind] || 0; }

  _checkStage() {
    let idx = this.stageIndex;
    for (let i = this.stageIndex + 1; i < STAGES.length; i++) if (this.score >= this.stageMin(i)) idx = i;
    if (idx !== this.stageIndex) {
      this.stageIndex = idx;
      this._startMission();
      this.bus.emit('stage', { index: idx, stage: STAGES[idx], level: this.level });
      if (idx === STAGES.length - 1) {
        this.flags.chapter3 = true;
        if (!this.extraFrom.chapter) { this.extraFrom.chapter = true; this._lightExtra('chapter'); }
        this._checkDragon();
      }
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
    if (this.lockServeTicks > 0 && --this.lockServeTicks === 0) this.ctl.serveBall(); // a new ball after a lock (no skill shot, no new ball save)
    if (this.superTicks > 0 && --this.superTicks === 0) { this.superArmed = false; this.bus.emit('superSkillEnd', {}); }

    if (this.rushTicks > 0 && --this.rushTicks === 0) this.bus.emit('rushEnd', {});
    if (this.boostTicks > 0 && --this.boostTicks === 0) this.bus.emit('boostEnd', {});
    if (this.frenzyTicks > 0 && --this.frenzyTicks === 0) { this.mushHits = 0; this.bus.emit('frenzyEnd', {}); }
    if (this.dragonTicks > 0 && --this.dragonTicks === 0) this._endDragon(true);

    if (this.doorTicks > 0 && --this.doorTicks === 0) {
      this.ctl.setDoor(false);
      this.wizardCharge = 0;
      this.bus.emit('doorClose', { entered: false });
      this.bus.emit('wizardCharge', { charge: 0 });
    }

    if (this.multiball && --this.mbTicks <= 0) this._endMultiball('timeout');

    if (this.skillArmed && --this.skillTicks <= 0) this.skillArmed = false;

    if (this.saveTicks > 0 && --this.saveTicks === 0) this.bus.emit('ballSaveEnd', {});

    if (this.danger > 0) this.danger = Math.max(0, this.danger - TILT.DECAY / HZ);
    if (this.nudgeCd > 0) this.nudgeCd--;

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
    const mush = id.startsWith('mush'), crystal = id.startsWith('crystal');
    this.award(mush && this.frenzyActive ? SCORE.ELEMENT * MODES.FRENZY_MULT : SCORE.ELEMENT, id, x, y);
    this._bonus(mush ? 'mush' : crystal ? 'crystal' : 'potion');
    this.bus.emit('element', { id, x, y });
    this._chainHit(x, y);
    this._dragonHit(id, x, y);
    if (id === 'potion' && !(this.kickLit.L && this.kickLit.R)) { // the potion relights both kickbacks
      this.kickLit.L = this.kickLit.R = true;
      this.bus.emit('kickback', { lit: true });
    }
    if (mush) {
      this._missionStep('ring', id);
      if (!this.frenzyActive && ++this.mushHits >= TUNE.FRENZY_HITS) { // Spore Frenzy: mushrooms ×5 for 20 s
        this.frenzyTicks = T.FRENZY;
        this.bus.emit('frenzyStart', { seconds: MODES.FRENZY_SECONDS });
      }
    }
    if (crystal) { // alternate the two crystals three times to light the Crystal Jackpot on the crystal ramp
      const q = this.crystalSeq;
      q.count = q.last && q.last !== id ? q.count + 1 : 1;
      q.last = id;
      if (!this.crystalLit && q.count >= TUNE.CRYSTAL_SEQ) {
        this.crystalLit = true;
        q.count = 0; q.last = null;
        this.bus.emit('crystalLit', { value: this.crystalValue });
      }
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
    this.rushCount++;
    this.flags.rush = true;
    this.bus.emit('rushStart', { seconds: TIMING.RUSH });
    this.bus.emit('comboProgress', { ids: [], count: 0 });
    if (this.rushCount >= MODES.EXTRA_BALL_RUSHES && !this.extraFrom.rush) { this.extraFrom.rush = true; this._lightExtra('rush'); }
    this._checkDragon();
  }

  onSlingHit(id, x, y) {
    if (!this._cool(id, T.ELEMENT_CD)) return;
    this.award(SCORE.SLING, 'sling', x, y);
    this._bonus('sling');
  }

  onOutlane(ball, side) {
    this.onLane(side === 'L' ? 0 : 3);
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
    if (this.saveTicks > 0) { // Ball Save: the ball comes straight back, nothing is lost
      this.saveTicks = 0;
      this.skillAvailable = false;
      this.ctl.serveBall();
      this.bus.emit('ballSaved', {});
      return;
    }
    // lost the ball
    this.chain = 0; this.chainTicks = 0;
    if (this.rushActive) { this.rushTicks = 0; this.bus.emit('rushEnd', {}); }
    if (this.boostActive) { this.boostTicks = 0; this.bus.emit('boostEnd', {}); }
    if (this.frenzyActive) { this.frenzyTicks = 0; this.mushHits = 0; this.bus.emit('frenzyEnd', {}); }
    if (this.dragonActive) this._endDragon(false);
    this.superArmed = false; this.superTicks = 0;
    if (this.doorOpen) {
      this.doorTicks = 0;
      this.ctl.setDoor(false);
      this.wizardCharge = 0;
      this.bus.emit('doorClose', { entered: false });
      this.bus.emit('wizardCharge', { charge: 0 });
    }
    // end-of-ball bonus: everything hit with this ball × the bonus multiplier (nothing when tilted)
    const tilted = this.tilted;
    this.tilted = false; // the bonus is paid on the clean state, a tilted ball pays nothing
    let bonusPoints = 0;
    if (!tilted && this.bonusBase > 0) {
      bonusPoints = this.award(this.bonusBase * this.bonusX, 'bonus');
      this.bus.emit('bonus', { base: this.bonusBase, x: this.bonusX, points: bonusPoints });
    }
    this.tilted = tilted;
    this._resetBallValues();
    const delay = bonusPoints > 0 ? T.BONUS_DELAY : T.SERVE_DELAY;
    if (this.extraBalls > 0) { // Shoot Again: the same ball number once more
      this.extraBalls--;
      this.serveTicks = delay;
      this.bus.emit('shootAgain', { ball: this.ball });
      return;
    }
    if (this.ball < BALLS_PER_GAME) {
      this.ball++;
      this.serveTicks = delay;
      this.bus.emit('ballLost', { nextBall: this.ball });
    } else if (!this.matchDone && this._match()) { // MATCH: the tens digit matches the drawn number -> one more ball
      this.serveTicks = delay + T.SERVE_DELAY;
    } else {
      this.state = 'gameover';
      const newHigh = this.score > this.highScore;
      if (newHigh) this.highScore = this.score;
      this.bus.emit('gameOver', { score: this.score, high: this.highScore, newHigh });
    }
  }
}

/** the feature modules add their methods (and getters) to GameRules */
for (const Mod of [SagaRules, ScoopRules, LaunchRules, LaneRules, TowerRules, ShotRules]) {
  for (const name of Object.getOwnPropertyNames(Mod.prototype)) {
    if (name === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(GameRules.prototype, name)) throw new Error(`rules: ${name} defined twice`);
    Object.defineProperty(GameRules.prototype, name, Object.getOwnPropertyDescriptor(Mod.prototype, name));
  }
}
