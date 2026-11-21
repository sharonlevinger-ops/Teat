// Game rules: scoring, chapters, modes, ball flow. No physics math and no rendering.
// Talks to the table only through the `ctl` interface (implemented by Simulation) and reports
// everything to the presentation layer through the EventBus.
//
// All timers are integer tick counters at the fixed simulation rate, so "30 seconds" is exactly 3600 ticks.

import {
  SCORE, TIMING, STAGES, RUSH_MULT, BALLS_PER_GAME, WIZARD_CHARGES, RUSH_ELEMENTS, SKILL_TARGET, secToTicks, COMBO_MAX, TILT, HZ,
  MODES, LANES,
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
  BONUS_DELAY: secToTicks(3.0), // time to read the end-of-ball bonus
  SAVE: secToTicks(TIMING.BALL_SAVE),
  NUDGE_CD: secToTicks(TILT.COOLDOWN),
  MYSTERY_SAVE: secToTicks(MODES.MYSTERY_SAVE),
  BOOST: secToTicks(MODES.BOOST_SECONDS),
  DRAGON: secToTicks(MODES.DRAGON_SECONDS),
  FRENZY: secToTicks(MODES.FRENZY_SECONDS),
  DOUBLE_ORBIT: secToTicks(MODES.DOUBLE_ORBIT_WINDOW),
  POOL_CD: secToTicks(0.5),
};
export const RULE_TICKS = T;
const MYSTERY_TOTAL = MODES.MYSTERY.reduce((a, [w]) => a + w, 0);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

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
    else if (this.doorOpen) { text = `SHOOT THE TOWER · HURRY-UP ${fmt(this.hurryValue)}`; target = 'door'; }
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
    this.dragonLit = new Set(MODES.DRAGON_TARGETS);
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
      this.dragonLit = new Set(MODES.DRAGON_TARGETS);
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

  // ---------------------------------------------------------------- extra ball
  _lightExtra(source) {
    this.extraLit++;
    this.bus.emit('extraBallLit', { source });
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
    if (!this.lanes[i]) {
      this.lanes[i] = true;
      this.award(MODES.LANE_POINTS, 'lane');
      this._bonus('lane');
      this.bus.emit('laneLit', { index: i, letter: LANES[i] });
    }
    if (this.lanes.every(Boolean)) {
      this.lanes = [false, false, false, false];
      const points = this.award(MODES.LANE_COMPLETE, 'lanesComplete');
      if (this.bonusX < MODES.BONUS_X_MAX) { this.bonusX++; this.bus.emit('bonusX', { x: this.bonusX }); }
      else this.bus.emit('lanesComplete', { points }); // multiplier already maxed: points only
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
      if (!this.frenzyActive && ++this.mushHits >= MODES.FRENZY_HITS) { // Spore Frenzy: mushrooms ×5 for 20 s
        this.frenzyTicks = T.FRENZY;
        this.bus.emit('frenzyStart', { seconds: MODES.FRENZY_SECONDS });
      }
    }
    if (crystal) { // alternate the two crystals three times to light the Crystal Jackpot on the crystal ramp
      const q = this.crystalSeq;
      q.count = q.last && q.last !== id ? q.count + 1 : 1;
      q.last = id;
      if (!this.crystalLit && q.count >= MODES.CRYSTAL_SEQ) {
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
    this.bus.emit('towerEnter', {});
    this._missionStep('dragon'); // counts for the chapter it happened in (before the points can change the chapter)
    this._dragonHit('tower');
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

  onRamp(id) {
    this.award(SCORE.RAMP, id);
    this._bonus('ramp');
    this.bus.emit('ramp', { id });
    this._chainHit();
    this._dragonHit(id);
    this._missionStep('moon');
    if (id === 'rampA' && this.crystalLit) { // Crystal Jackpot (lit by alternating the crystals)
      this.crystalLit = false;
      const points = this.award(this.crystalValue, 'crystalJackpot');
      this.crystalValue = Math.min(MODES.CRYSTAL_MAX, this.crystalValue + MODES.CRYSTAL_STEP);
      this.bus.emit('crystalJackpot', { points });
    }
    // Double Orbit: the crystal ramp and the golden ramp back to back (either order)
    const lr = this.lastRamp;
    if (lr && lr.id !== id && this.tick - lr.tick <= T.DOUBLE_ORBIT) {
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
    this.poolCharge = Math.min(MODES.POOL_PASSES, this.poolCharge + 1);
    this.bus.emit('poolCharge', { charge: this.poolCharge, of: MODES.POOL_PASSES });
    if (this.poolCharge >= MODES.POOL_PASSES) { this.poolLit = true; this.bus.emit('poolLit', { value: this.poolValue }); }
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
    } else {
      this.state = 'gameover';
      const newHigh = this.score > this.highScore;
      if (newHigh) this.highScore = this.score;
      this.bus.emit('gameOver', { score: this.score, high: this.highScore, newHigh });
    }
  }
}
