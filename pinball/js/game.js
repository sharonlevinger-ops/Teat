// Game rules: scoring, modes (wizard multiball, save the princess, final battle), dwarf treasure,
// M-A-G-E, combos, multiplayer turns, practice mode, daily challenge, per-game stats, save/restore.
import * as L from './layout.js';
import * as Store from './store.js';

export const BALL_SAVE_SECONDS = 15; // default; Settings can change it (0 / 8 / 15 / 20)
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export const ACHIEVEMENTS = {
  wizard: 'מולטיבול המכשף',
  princess: 'הצלת הנסיכה',
  treasure: 'מטמון הגמדים',
  mage: 'אמן M-A-G-E',
  combo5: 'קומבו x5',
  skill: 'מכת פתיחה',
  million: 'מיליון נקודות',
  mystery: 'סוד המסתורין',
  final: 'הקרב האחרון',
  daily: 'אתגר יומי',
};

export const SHOT_NAMES = { towerRamp: 'רמפת המגדל', crystal: 'רמפת הקריסטל', orbit: 'הקפת היער', tower: 'חור המגדל', castle: 'שער הטירה', mine: 'המכרה', mystery: 'חור המסתורין' };
export const PRACTICE = {
  crystal: { name: 'רמפת הקריסטל', flipper: 'הפליפר השמאלי', feed: { x: 126, y: 942, vx: 0, vy: 260 } },
  towerRamp: { name: 'רמפת המגדל', flipper: 'הפליפר הימני', feed: { x: 597, y: 946, vx: 0, vy: 260 } },
  orbit: { name: 'הקפת היער', flipper: 'הפליפר השמאלי-עליון', feed: { x: 230, y: 494, vx: -40, vy: 650 } },
};

// fields that belong to one player (swapped on every turn change in multiplayer)
const PLAYER_FIELDS = ['score', 'ballNum', 'bonusX', 'mageDone', 'mage', 'towerLocks', 'castleHits', 'gateOpen', 'dwarfs', 'treasures',
  'princessSaved', 'mysteryLit', 'shields', 'bestCombo', 'gameAch', 'stats', 'flags', 'finalReady'];
const newStats = () => ({ drains: { center: 0, L: 0, R: 0 }, shots: { towerRamp: 0, crystal: 0, orbit: 0, tower: 0, castle: 0, mine: 0, mystery: 0 }, ballTimes: [], ballStart: null });
const newFlags = () => ({ wizard: false, castle: false, treasure: false, gate: false, princess: false });
const clone = (v) => (v instanceof Set ? new Set(v) : JSON.parse(JSON.stringify(v)));

export class Game {
  constructor(phys, world, sound, ui, settings = Store.loadSettings()) {
    this.phys = phys; this.world = world; this.sound = sound; this.ui = ui;
    this.settings = settings;
    this.state = 'attract';
    this.profiles = Store.loadProfiles();
    this.best = Store.loadBest(this.profiles.selected[0]);
    phys.handlers.onHit = (...a) => this.onHit(...a);
    phys.handlers.onSubstep = (...a) => this.onSubstep(...a);
    phys.handlers.onRailExit = (...a) => this.onRailExit(...a);
    this.time = 0;
    this.holds = [];
    this.timers = [];
    this.players = [{ id: this.profiles.selected[0], name: Store.profileName(this.profiles, this.profiles.selected[0]) }];
    this.cur = 0;
    this.practice = null;
    this.resetGameVars();
  }

  get maxBalls() { return this.settings.balls || 3; }
  get player() { return this.players[this.cur]; }

  resetGameVars() {
    Object.assign(this, {
      score: 0, ballNum: 1, bonusX: 1, mult: 1, mushroomHits: 0, combo: 0, lastShotT: -99, bestCombo: 0,
      mage: [false, false, false, false], mageDone: 0, kick: { L: true, R: true },
      towerLocks: 0, castleHits: 0, gateOpen: false, castleMode: false, jackpots: 0, princessSaved: false,
      drops: [false, false, false], shields: [false, false, false], mysteryLit: false, dwarfs: 0, treasures: 0,
      ballSave: 0, ballSaveArmed: true, multiball: false, ramps: 0, gameAch: new Set(), skillWindow: 0, towerRampBoost: false,
      pendingBalls: 0, ballLostTimer: 0, tilt: false, stats: newStats(), flags: newFlags(), finalReady: false, finalT: 0, finalJackpot: 0,
      dailyDone: false,
    });
  }

  // apply settings that touch the physics / table
  applySettings(settings = this.settings) {
    this.settings = settings;
    this.phys.gravityScale = settings.speed || 1;
    const post = this.phys.circles.find((c) => c.x === L.CENTER_POST.x && c.y === L.CENTER_POST.y);
    if (post) {
      post.enabled = settings.difficulty !== 'hard';
      post.r = settings.difficulty === 'normal' ? 4 : L.CENTER_POST.r; // normal: a centred ball can slip past
    }
    this.world.fx?.('postVisible', { on: settings.difficulty !== 'hard', small: settings.difficulty === 'normal' });
  }

  // ------------------------------------------------------------------ flow
  // players: [{id, name}] (1-4), practice: key of PRACTICE or null
  startGame({ players, practice = null } = {}) {
    this.phys.balls.length = 0;
    this.holds = []; this.timers = [];
    this.resetGameVars();
    this.practice = practice;
    this.players = (players && players.length ? players : this.players).slice(0, 4).map((p) => ({ id: p.id, name: p.name, state: null }));
    this.cur = 0;
    this.bests = Object.fromEntries(this.players.map((p) => [p.id, Store.loadBest(p.id)]));
    this.best = this.bests[this.players[0].id];
    this.challenge = Store.todayChallenge();
    this.dailyAlready = Object.fromEntries(this.players.map((p) => [p.id, Store.dailyStatus(p.id).doneToday]));
    this.state = 'playing';
    if (L.castleGate.seg) L.castleGate.seg.enabled = true;
    for (const d of L.dropTargets) if (d.seg) d.seg.enabled = true;
    this.world.fx('dropReset');
    this.world.fx('gateOpen', { open: false });
    this.world.fx('princess', { on: false });
    this.world.setMood('normal');
    this.sound.play('start');
    this.sound.intensity = 0;
    if (practice) { this.practiceStats = { tries: 0, hits: 0 }; this.feedPractice(); this.ui.message('אימון: ' + PRACTICE[practice].name, 'כוונו עם ' + PRACTICE[practice].flipper, '#9fe0ff', 2.4); return; }
    this.newBall();
    const who = this.players.length > 1 ? `תור של ${this.player.name}` : `${this.player.name}, בהצלחה!`;
    this.ui.message(who, 'משכו את הקפיץ לשיגור', '#ffe08a', 2.2);
  }

  newBall() {
    const b = this.phys.addBall(L.PLUNGER.x, L.PLUNGER.y);
    b.launched = false;
    this.ballSaveArmed = true;
    this.skillWindow = 0;
    this.mult = 1; this.mushroomHits = 0;
    this.kick.L = this.kick.R = true; // one outlane save per ball (left or right)
    this.stats.ballStart = this.time;
    return b;
  }

  // ---------- practice: feed the ball to the flipper for the chosen shot, again and again
  feedPractice() {
    const f = PRACTICE[this.practice].feed;
    for (const b of [...this.phys.balls]) this.phys.removeBall(b);
    const b = this.phys.addBall(f.x, f.y, f.vx, f.vy);
    b.launched = true; b.riseStart = this.time; b.noCap = this.time + 1;
    this.practiceStats.tries++;
    this.practiceFeedT = this.time;
    this.world.fx('ring', { x: f.x, y: f.y });
  }

  // ---------- multiplayer: save / load one player's progress
  savePlayerState() { const st = {}; for (const k of PLAYER_FIELDS) st[k] = clone(this[k]); this.player.state = st; }
  loadPlayerState() {
    const st = this.player.state;
    if (!st) { // first turn of this player
      Object.assign(this, { score: 0, ballNum: 1, bonusX: 1, mageDone: 0, mage: [false, false, false, false], towerLocks: 0, castleHits: 0, gateOpen: false,
        dwarfs: 0, treasures: 0, princessSaved: false, mysteryLit: false, shields: [false, false, false], bestCombo: 0, gameAch: new Set(), stats: newStats(), flags: newFlags(), finalReady: false });
    } else for (const k of PLAYER_FIELDS) this[k] = clone(st[k]);
    // the table must show this player's gate
    if (L.castleGate.seg) L.castleGate.seg.enabled = !this.gateOpen;
    this.world.fx('gateOpen', { open: this.gateOpen });
    this.best = this.bests[this.player.id];
    this.dailyDone = false;
  }

  activeBalls() { return this.phys.balls.length + this.pendingBalls; }

  later(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }

  addScore(n, x, y) {
    if (this.practice) return 0;
    const v = Math.round(n * (this.multiball ? 2 : 1));
    this.score += v;
    if (x !== undefined) this.ui.popup(v, x, y);
    if (this.score >= 1_000_000) this.achieve('million');
    return v;
  }

  achieve(id) {
    if (this.practice || this.gameAch.has(id)) return;
    this.gameAch.add(id);
    const isNew = !this.best.achievements.includes(id);
    if (isNew) { this.best.achievements.push(id); Store.saveBest(this.player.id, this.best); this.ui.toast('🏆 הישג חדש: ' + ACHIEVEMENTS[id]); }
  }

  shot(name, x, y) {
    if (this.stats.shots[name] !== undefined) this.stats.shots[name]++;
    // combo tracking for major shots
    if (this.time - this.lastShotT < 5) this.combo++; else this.combo = 1;
    this.lastShotT = this.time;
    if (this.combo >= 2) {
      const v = this.addScore(10000 * this.combo, x, y);
      this.ui.message(`קומבו x${this.combo}`, '+' + fmt(v), '#7fe6ff', 1.2);
      this.sound.play('combo', this.combo);
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      if (this.combo >= 5) this.achieve('combo5');
    }
  }

  // ------------------------------------------------------------------ physics events
  onHit(type, ball, obj, imp) {
    if (this.state !== 'playing') { if (type === 'bumper') this.world.fx('bumper', { bumper: obj }); return; }
    const vol = Math.min(1, imp / 1500);
    switch (type) {
      case 'bumper': {
        this.world.fx('bumper', { bumper: obj });
        this.sound.play('bumper');
        this.addScore(1000 * this.mult, obj.x, obj.y);
        this.mushroomHits++;
        if (this.mushroomHits % 12 === 0 && this.mult < 5) { this.mult++; this.ui.message(`מכפיל פטריות x${this.mult}`, 'הנבגים זוהרים!', '#ff9ef0', 1.5); this.sound.play('magic'); this.world.setMood(this.moodName()); }
        if (this.skillWindow > 0) { this.skillWindow = 0; const v = this.addScore(50000); this.ui.message('מכת פתיחה!', '+' + fmt(v), '#fff27a', 1.8); this.sound.play('jackpot'); this.world.fx('lightshow'); this.achieve('skill'); }
        break;
      }
      case 'sling':
        this.world.fx('sling', { side: obj.side, x: ball.x, y: ball.y });
        this.sound.play('sling'); this.addScore(110);
        break;
      case 'drop': {
        const i = obj.i;
        if (this.drops[i]) break;
        this.drops[i] = true; obj.seg.enabled = false;
        this.world.fx('drop', { i }); this.sound.play('drop');
        this.addScore(2500 * this.mult, obj.cx, obj.cy);
        if (this.drops.every(Boolean)) {
          this.addScore(25000);
          this.mysteryLit = true; this.kick.L = this.kick.R = true; // re-arm the outlane save on both sides
          this.ui.message('מגני הנסיך נפלו!', 'חור המסתורין דולק', '#9fb8ff', 1.8);
          this.sound.play('magic');
          this.later(1.4, () => this.resetDrops());
        }
        break;
      }
      case 'shield': {
        const i = obj.i;
        this.world.fx('shield', { i }); this.sound.play('target');
        this.addScore((this.shields[i] ? 1500 : 5000) * this.mult, obj.cx, obj.cy);
        this.shields[i] = true;
        if (this.shields.every(Boolean)) {
          this.shields = [false, false, false];
          this.ballSave = Math.max(this.ballSave, 15);
          this.addScore(30000);
          this.ui.message('ברכת הנסיך', 'הצלת כדור ל-15 שניות', '#ff9a8a', 1.8);
          this.sound.play('save');
        }
        break;
      }
      case 'gate': {
        if (this.gateOpen) break;
        this.world.fx('gate'); this.sound.play('target');
        this.castleHits++;
        this.addScore(5000, 505, 470);
        if (this.castleHits >= 3) this.openGate();
        else this.ui.message('שער הטירה', `עוד ${3 - this.castleHits} פגיעות`, '#ffd27a', 1);
        break;
      }
      case 'flipper': break;
      case 'ball': this.sound.play('ball', vol); break;
      case 'post': this.sound.play('post', vol); this.addScore(50); break;
      case 'tower': case 'wall': case 'rock': this.sound.play('wall', vol); break;
      default: break;
    }
  }

  resetDrops() {
    this.drops = [false, false, false];
    for (const d of L.dropTargets) d.seg.enabled = true;
    this.world.fx('dropReset');
    this.sound.play('kick');
  }

  openGate() {
    this.gateOpen = true; this.flags.gate = true;
    L.castleGate.seg.enabled = false;
    this.world.fx('gateOpen', { open: true });
    this.ui.message('שער הטירה נפתח!', 'הכניסו כדור להצלת הנסיכה', '#ffcf6a', 2.2);
    this.sound.play('lock');
  }
  closeGate() {
    this.gateOpen = false; this.castleHits = 0;
    L.castleGate.seg.enabled = true;
    this.world.fx('gateOpen', { open: false });
  }

  onSubstep(b, px, py) {
    if (this.state !== 'playing' && this.state !== 'attract') return;
    const speed = Math.hypot(b.vx, b.vy);
    // ramps (all one-way, entered going up the table)
    for (const [name, r] of Object.entries(L.ramps)) {
      const e = r.entry;
      const sd = r.side;
      const sideIn = sd && px < sd.x && b.x >= sd.x && b.y > sd.y0 && b.y < sd.y1 && b.vx > 0;
      if (sideIn || (py >= e.y && b.y < e.y && Math.abs(b.x - e.x) < e.w / 2 && b.vy < 0)) {
        if (speed >= r.minSpeed) {
          this.phys.enterRail(b, name, speed);
          this.sound.play(r.noScore ? 'wire' : name === 'orbit' ? 'wire' : 'ramp');
          if (name === 'crystal') this.world.fx('crystal');
          return;
        }
        if (sideIn) { b.vx = -Math.abs(b.vx) * 0.35; this.sound.play('rampFail'); } else if (name !== 'orbit') { b.y = e.y + 1; b.vy = Math.abs(b.vy) * 0.35; this.sound.play('rampFail'); }
      }
    }
    // saucers
    for (const h of L.holes) {
      if (h.id === "castle" && !this.gateOpen) continue;
      const d = Math.hypot(b.x - h.x, b.y - h.y);
      if (d < h.r * 0.95 && speed < 1700 && !(b.noCap > this.time)) { this.capture(b, h); return; }
    }
    // sensors (enter detection)
    b.inside = b.inside || {};
    const sens = (id, x, y, r, fn) => {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r) { if (!b.inside[id]) { b.inside[id] = true; fn(); } } else if (d > r + 6) b.inside[id] = false;
    };
    for (const r of L.rollovers) sens('ro' + r.id, r.x, r.y, r.r, () => this.rollover(r, b));
    sens('pool', L.pool.x, L.pool.y, L.pool.r, () => this.poolHit(b));
    for (const k of L.kickbacks) {
      const inLane = k.side === 'L' ? b.x < 100 : b.x > 618 && b.x < L.FIELD.laneIn;
      if (inLane && py < k.y && b.y >= k.y && b.vy > 0) this.kickback(k, b);
    }
    // spinner + orbit
    const sp = L.spinner;
    if ((py - sp.y) * (b.y - sp.y) < 0 && b.x > sp.a[0] && b.x < sp.b[0]) {
      const spins = Math.max(1, Math.round(Math.abs(b.vy) / 160));
      this.world.fx('spin', { speed: Math.abs(b.vy) });
      for (let i = 0; i < Math.min(spins, 8); i++) setTimeout(() => this.sound.play('spinner'), i * 45);
      if (this.state === 'playing') this.addScore(150 * spins * this.mult);
    }
    // launched?
    if (!b.launched && b.y < 1100) { b.launched = true; this.onLaunched(b); }
  }

  onLaunched() {
    if (this.ballSaveArmed) { this.ballSave = this.settings.ballSave ?? BALL_SAVE_SECONDS; this.ballSaveArmed = false; }
    this.skillWindow = 4;
  }

  rollover(r, b) {
    if (this.state !== 'playing') return;
    const i = 'MAGE'.indexOf(r.id);
    this.sound.play('rollover');
    this.addScore(1000, r.x, r.y);
    if (!this.mage[i]) {
      this.mage[i] = true;
      if (this.mage.every(Boolean)) {
        this.mage = [false, false, false, false];
        this.mageDone++;
        if (this.bonusX < 5) this.bonusX++;
        this.kick.L = this.kick.R = true;
        this.addScore(25000);
        this.ui.message('M · A · G · E', `בונוס x${this.bonusX} · קיקבק דולק`, '#ffd27a', 2);
        this.sound.play('magic');
        this.achieve('mage');
      }
    }
  }

  laneChange(dir) {
    if (this.state !== 'playing') return;
    if (dir < 0) this.mage.push(this.mage.shift()); else this.mage.unshift(this.mage.pop());
  }

  poolHit(b) {
    if (this.state !== 'playing') { this.world.fx('splash', { x: b.x, y: b.y, h: 4 }); return; }
    this.world.fx('splash', { x: b.x, y: b.y, h: 4 });
    this.sound.play('pool');
    this.addScore(this.multiball ? 5000 : 1000);
  }

  kickback(k, b) {
    if (this.state !== 'playing' || b.vy <= 0) return;
    if (this.kick[k.side]) {
      this.kick.L = this.kick.R = false; // the save is used up until the next ball (or M-A-G-E)
      b.outlane = false;                 // flippers must see this ball again
      b.y = k.y - 2;
      b.vy = (k.side === 'L' ? -1900 : -1700) - Math.random() * 100; b.vx = (k.side === 'L' ? 1 : -1) * 30;
      this.sound.play('kickback');
      this.world.fx('burst', { x: k.x, y: k.y, color: 0x6dff8a, n: 30 });
      this.ui.message('הכדור ניצל!', 'בפעם הבאה בצד – הכדור אבד', '#6dff8a', 1.6);
    }
  }

  capture(b, h) {
    b.sinkFrom = [b.x, b.y]; b.sinkStart = this.time; // drives the sinking animation in World
    b.mode = 'held'; b.vx = b.vy = 0; b.x = h.x; b.y = h.y; b.h = 0;
    this.sound.play('hole');
    this.world.fx('spark', { x: h.x, y: h.y, h: 10, color: 0xffffff, n: 18 });
    let delay = 1.0;
    if (this.state === 'playing' && !this.practice) delay = this.awardHole(h, b) || 1.0;
    this.holds.push({ b, h, t: this.time + delay });
  }

  kickOut(hd) {
    const { b, h } = hd;
    b.mode = 'field';
    b.noCap = this.time + 0.6;
    b.riseStart = this.time; // rising-out-of-the-hole animation in World
    this.world.fx('ring', { x: h.out ? h.out[0] : h.x, y: h.out ? h.out[1] : h.y });
    const j = 1 + (Math.random() - 0.5) * 0.12;
    b.vx = h.kick.vx * j; b.vy = h.kick.vy * j;
    if (h.out) { b.x = h.out[0]; b.y = h.out[1]; } else { b.x = h.x + Math.sign(h.kick.vx) * 4; b.y = h.y + Math.sign(h.kick.vy) * 4; }
    if (h.tunnel) {
      // underground passage: the ball reappears on the inlane wireform and rolls to a flipper
      this.sound.play('wire');
      this.world.fx('burst', { x: b.x, y: b.y, h: 10, color: 0xffd080, n: 24, speed: 1.2 });
    } else {
      this.sound.play('kick');
      this.world.fx('spark', { x: h.x, y: h.y, h: 10, color: 0xffd080, n: 12 });
    }
  }

  awardHole(h, b) {
    switch (h.id) {
      case 'tower': {
        this.world.fx('flame');
        if (this.finalReady && !this.multiball) { this.stats.shots.tower++; this.startFinal(h); return 2.6; }
        this.addScore((this.towerRampBoost ? 20000 : 10000) * this.mult, h.x, h.y);
        this.towerRampBoost = false;
        if (this.multiball === 'final') { this.finalHit(h.x, h.y); return 1.0; }
        if (this.multiball) { const v = this.addScore(100000); this.ui.message('ג׳קפוט המכשף!', '+' + fmt(v), '#7fc8ff', 1.6); this.sound.play('jackpot'); this.world.fx('lightshow'); return 1.0; }
        this.towerLocks++;
        this.sound.play('lock');
        if (this.towerLocks >= 3) {
          this.towerLocks = 0;
          this.startMultiball('wizard', h);
          return 2.2;
        }
        this.ui.message(`נעילת מגדל ${this.towerLocks}/3`, 'הלהבה הכחולה מתחזקת', '#8fc8ff', 1.6);
        this.shot('tower', h.x, h.y);
        return 1.4;
      }
      case 'castle': {
        this.stats.shots.castle++;
        this.closeGate();
        if (this.multiball === 'final') { this.finalHit(h.x, h.y); return 1.0; }
        if (!this.castleMode && !this.multiball) {
          this.castleMode = true; this.jackpots = 0;
          this.world.fx('princess', { on: true });
          this.startMultiball('castle', h);
          return 2.4;
        }
        this.addScore(75000, h.x, h.y); this.sound.play('jackpot'); this.world.fx('lightshow');
        return 1.2;
      }
      case 'mystery2':
      case 'mystery': {
        if (!this.mysteryLit) { this.addScore(5000, h.x, h.y); return 0.8; }
        this.mysteryLit = false;
        this.achieve('mystery');
        const awards = [
          ['100,000 נקודות', () => this.addScore(100000)],
          ['קיקבק כפול', () => { this.kick.L = this.kick.R = true; }],
          ['בונוס +1', () => { this.bonusX = Math.min(5, this.bonusX + 1); }],
          ['הצלת כדור 20 שניות', () => { this.ballSave = Math.max(this.ballSave, 20); }],
          ['שני גמדים', () => { this.advanceDwarf(); this.advanceDwarf(); }],
          ['שער הטירה נפתח', () => { if (!this.gateOpen && !this.castleMode) this.openGate(); else this.addScore(80000); }],
          ['מכפיל פטריות +1', () => { this.mult = Math.min(5, this.mult + 1); }],
        ];
        const [label, fn] = awards[Math.floor(Math.random() * awards.length)];
        fn();
        this.ui.message('חור המסתורין', label, '#d79bff', 2);
        this.sound.play('magic');
        this.shot('mystery', h.x, h.y);
        return 1.8;
      }
      case 'mine': {
        this.world.fx('mineHit');
        if (this.multiball === 'final') { this.stats.shots.mine++; this.finalHit(h.x, h.y); return 1.0; }
        if (this.dwarfs >= 7) {
          this.treasures++;
          const v = this.addScore(300000 + 150000 * (this.treasures - 1), h.x, h.y);
          this.dwarfs = 0;
          this.world.fx('treasure'); this.world.setMood('treasure');
          this.later(3, () => this.world.setMood(this.moodName()));
          this.ui.message('מטמון הגמדים!', '+' + fmt(v), '#ffd24a', 2.6);
          this.sound.play('treasure'); this.world.fx('lightshow');
          this.achieve('treasure'); this.flags.treasure = true; this.stats.shots.mine++;
          this.checkFinalReady();
          return 2.6;
        }
        this.addScore(5000, h.x, h.y); this.advanceDwarf();
        this.shot('mine', h.x, h.y);
        return 1.0;
      }
    }
    return 1;
  }

  advanceDwarf() {
    if (this.dwarfs >= 7) return;
    this.dwarfs++;
    if (this.dwarfs === 7) { this.ui.message('7 הגמדים מוכנים', 'היכנסו למכרה למטמון!', '#ffb347', 2); this.sound.play('magic'); }
  }

  startMultiball(kind, hole) {
    this.multiball = kind;
    this.sound.play('multiball'); this.world.fx('lightshow');
    this.sound.intensity = 1;
    this.world.setMood(kind === 'castle' ? 'castle' : 'multiball');
    if (kind === 'wizard') { this.ui.message('מולטיבול המכשף!', 'ג׳קפוט במגדל ובכל רמפה', '#7fc8ff', 2.6); this.achieve('wizard'); this.world.fx('flame'); this.flags.wizard = true; }
    else if (kind === 'castle') { this.ui.message('הצילו את הנסיכה!', 'רמפת הקריסטל = ג׳קפוט', '#ffcf6a', 2.6); this.flags.castle = true; }
    this.checkFinalReady();
    const extra = Math.max(0, 3 - this.phys.balls.length);
    this.pendingBalls += extra;
    for (let i = 0; i < extra; i++) {
      this.later(0.9 + i * 0.8, () => {
        this.pendingBalls--;
        if (this.state !== 'playing') return;
        const o = hole.out || [hole.x, hole.y + 6];
        const nb = this.phys.addBall(o[0] + (Math.random() - 0.5) * 4, o[1], hole.kick.vx * (0.8 + Math.random() * 0.4), hole.kick.vy);
        nb.noCap = this.time + 0.8; nb.riseStart = this.time;
        nb.launched = true;
        this.sound.play('kick');
        this.world.fx('burst', { x: hole.x, y: hole.y, color: kind === 'castle' ? 0xffcf6a : 0x7fc8ff });
      });
    }
    this.ballSave = Math.max(this.ballSave, 10);
  }

  // ---------- final battle (wizard mode): unlocked by wizard multiball + princess multiball + treasure in one game
  checkFinalReady() {
    if (this.finalReady || this.multiball === 'final') return;
    if (this.flags.wizard && this.flags.castle && this.flags.treasure) {
      this.finalReady = true;
      this.later(2.8, () => { this.ui.message('הקרב האחרון מוכן!', 'הכניסו כדור לחור המגדל', '#ff7ad9', 2.6); this.sound.play('lock'); this.world.fx('lightshow'); });
    }
  }
  startFinal(hole) {
    this.finalReady = false;
    this.finalT = 45; this.finalJackpot = 0;
    this.flags = newFlags(); // the next final needs all three again
    this.startMultiball('final', hole);
    this.ui.message('הקרב האחרון!', '45 שניות · כל מכה = ג׳קפוט', '#ff7ad9', 2.8);
    this.world.setMood('treasure'); this.world.fx('flame');
    this.achieve('final');
  }
  finalHit(x, y) {
    this.finalJackpot++;
    const v = this.addScore(150000 * this.finalJackpot, x, y);
    this.ui.message(`ג׳קפוט ${this.finalJackpot}`, '+' + fmt(v), '#ff7ad9', 1.2);
    this.sound.play('jackpot'); this.world.fx('lightshow');
    this.world.fx('burst', { x, y, color: 0xff7ad9, n: 50, speed: 2.4 });
  }

  endMultiball() {
    if (!this.multiball) return;
    const kind = this.multiball;
    this.multiball = false;
    this.sound.intensity = 0;
    if (kind === 'final') {
      this.finalT = 0;
      this.ui.message('הקרב האחרון הסתיים', `${this.finalJackpot} ג׳קפוטים`, '#ff7ad9', 2.2);
      this.world.setMood(this.moodName());
      return;
    }
    if (kind === 'castle') {
      this.castleMode = false;
      this.world.fx('princess', { on: false });
      if (!this.princessSaved) this.ui.message('המולטיבול הסתיים', `${this.jackpots} ג׳קפוטים`, '#ffcf6a', 1.6);
    } else this.ui.message('המולטיבול הסתיים', '', '#7fc8ff', 1.2);
    this.world.setMood(this.moodName());
  }

  moodName() {
    if (this.multiball === 'final') return 'treasure';
    if (this.multiball === 'castle') return 'castle';
    if (this.multiball) return 'multiball';
    if (this.mult >= 3) return 'hot';
    return 'normal';
  }

  onRailExit(b, name) {
    if (this.state !== 'playing' || L.ramps[name].noScore) return;
    if (this.practice) {
      if ((name === 'tower' ? 'towerRamp' : name) === this.practice) { this.practiceStats.hits++; this.sound.play('jackpot'); this.world.fx('lightshow'); this.ui.message('פגיעה!', `${this.practiceStats.hits}/${this.practiceStats.tries}`, '#7fffa0', 1); }
      this.later(0.8, () => { if (this.state === 'playing' && this.practice) this.feedPractice(); });
      return;
    }
    this.ramps++;
    if (this.multiball === 'final') { this.stats.shots[name === 'tower' ? 'towerRamp' : name]++; this.finalHit(b.x, b.y); return; }
    if (name === 'orbit') {
      const v = this.addScore(25000 * this.mult, 600, 900);
      this.ui.message('הקפת היער', '+' + fmt(v), '#b7ff8a', 1.2);
      this.sound.play('magic'); this.advanceDwarf(); this.shot('orbit', 600, 900);
      if (this.multiball === 'wizard') { const j = this.addScore(50000); this.sound.play('jackpot'); this.world.fx('lightshow'); this.ui.message('ג׳קפוט!', '+' + fmt(j), '#7fc8ff', 1.2); }
      return;
    }
    if (name === 'tower') {
      const v = this.addScore(30000 * this.mult, 150, 900);
      this.towerRampBoost = true;
      this.ui.message('רמפת המגדל', '+' + fmt(v), '#cfe6ff', 1.1);
      if (this.multiball === 'wizard') { const j = this.addScore(75000); this.ui.message('ג׳קפוט!', '+' + fmt(j), '#7fc8ff', 1.4); this.sound.play('jackpot'); this.world.fx('lightshow'); }
      this.advanceDwarf(); this.shot('towerRamp', 150, 900);
    } else {
      this.world.fx('crystal');
      if (this.castleMode) {
        this.jackpots++;
        const v = this.addScore(250000 + 50000 * (this.jackpots - 1), 430, 280);
        this.ui.message(`ג׳קפוט ${this.jackpots}`, '+' + fmt(v), '#ffe27a', 1.8);
        this.sound.play('jackpot'); this.world.fx('lightshow');
        this.world.fx('burst', { x: 430, y: 270, color: 0xffe27a, n: 60 });
        if (this.jackpots === 3 && !this.princessSaved) {
          this.princessSaved = true;
          const p = this.addScore(1_000_000);
          this.ui.message('הנסיכה ניצלה!', '+' + fmt(p), '#ff9ad0', 3);
          this.sound.play('treasure'); this.world.fx('lightshow'); this.achieve('princess'); this.flags.princess = true;
          this.world.fx('burst', { x: 540, y: 300, h: 160, color: 0xff9ad0, n: 120, speed: 3 });
        }
      } else {
        const v = this.addScore(40000 * this.mult, 440, 350);
        this.ui.message('רמפת הקריסטל', '+' + fmt(v), '#7fe6ff', 1.1);
        if (this.multiball === 'wizard') { const j = this.addScore(75000); this.sound.play('jackpot'); this.world.fx('lightshow'); this.ui.message('ג׳קפוט!', '+' + fmt(j), '#7fc8ff', 1.4); }
      }
      this.advanceDwarf(); this.shot('crystal', 430, 280);
    }
  }

  // ------------------------------------------------------------------ plunger
  plungerLaunch(power) {
    const b = this.phys.balls.find((x) => x.mode === 'field' && x.x > L.FIELD.laneIn && x.y > 1150);
    this.sound.play('plunger');
    if (!b) return;
    b.vy = -(950 + power * 2550) * (0.98 + Math.random() * 0.04);
    b.vx = 0;
  }
  ballInLane() { return this.phys.balls.some((x) => x.mode === 'field' && x.x > L.FIELD.laneIn && x.y > 1150 && Math.abs(x.vy) < 60); }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    this.time += dt;
    // timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= this.time);
      this.timers = this.timers.filter((t) => t.t > this.time);
      due.forEach((t) => t.fn());
    }
    // holes
    if (this.holds.length) {
      const due = this.holds.filter((h) => h.t <= this.time);
      this.holds = this.holds.filter((h) => h.t > this.time);
      due.forEach((h) => this.kickOut(h));
    }
    if (this.ballSave > 0) this.ballSave = Math.max(0, this.ballSave - dt);
    if (this.multiball === 'final' && this.state === 'playing') { this.finalT -= dt; if (this.finalT <= 0) this.endMultiball(); }
    if (this.practice && this.state === 'playing' && this.time - this.practiceFeedT > 9) this.feedPractice(); // ball wandered off
    if (this.state === 'playing' && !this.practice && !this.dailyDone && !this.dailyAlready[this.player.id] && this.challenge.done(this.dailySnapshot())) {
      this.dailyDone = true; this.dailyAlready[this.player.id] = true;
      const st = Store.completeDaily(this.player.id);
      this.ui.message('🎯 האתגר היומי הושלם!', `${this.challenge.text} · רצף ${st.streak} ימים`, '#9fffb0', 2.6);
      this.sound.play('treasure'); this.world.fx('lightshow'); this.achieve('daily');
    }
    if (this.skillWindow > 0) this.skillWindow = Math.max(0, this.skillWindow - dt);

    // drains & stuck balls
    for (const b of [...this.phys.balls]) {
      if (b.mode === 'field' && b.y > L.DRAIN_Y && b.x < L.FIELD.laneIn) this.drain(b);
      else if (b.mode === 'field') {
        const sp = Math.hypot(b.vx, b.vy);
        const inLane = b.x > L.FIELD.laneIn && b.y > 1150;
        const restingOnFlippers = b.y > 1100 && b.x > 215 && b.x < 505; // the player can flip it: no auto-nudge
        if (sp < 12 && !inLane && !restingOnFlippers) { b.still += dt; if (b.still > 2.2) { b.vx = (Math.random() - 0.5) * 600; b.vy = -500 - Math.random() * 300; b.still = 0; } } else b.still = 0;
      }
    }
    // rolling sound
    let maxSp = 0;
    for (const b of this.phys.balls) if (b.mode === 'field') maxSp = Math.max(maxSp, Math.hypot(b.vx, b.vy)); else if (b.mode === 'rail') maxSp = Math.max(maxSp, b.rv * 1.2);
    this.sound.setRoll(this.state === 'playing' ? maxSp : 0);

    if (this.state === 'playing') this.updateLamps();
  }

  dailySnapshot() { return { shots: this.stats.shots, flags: this.flags, score: this.score, mageDone: this.mageDone, bestCombo: this.bestCombo }; }

  drain(b) {
    this.phys.removeBall(b);
    if (this.state !== 'playing') return;
    if (this.practice) { this.later(0.5, () => { if (this.state === 'playing' && this.practice) this.feedPractice(); }); return; }
    const left = this.activeBalls();
    if (this.ballSave > 0 && (left === 0 || this.multiball)) {
      this.ui.message('הכדור ניצל!', 'שוב לשיגור', '#ff8a8a', 1.4);
      this.sound.play('save');
      const nb = this.phys.addBall(L.PLUNGER.x, L.PLUNGER.y);
      nb.launched = true;
      if (this.multiball) this.later(0.6, () => this.plungerLaunch(0.55 + Math.random() * 0.1));
      return;
    }
    if (this.multiball && left <= 1) this.endMultiball();
    if (left > 0) return;
    // end of ball: remember how it was lost
    this.stats.drains[b.outlane ? (b.outSide || (b.x < L.CX ? 'L' : 'R')) : 'center']++;
    if (this.stats.ballStart !== null) this.stats.ballTimes.push(this.time - this.stats.ballStart);
    this.sound.play('drain');
    this.world.setMood('drain');
    if (this.castleMode) { this.castleMode = false; this.world.fx('princess', { on: false }); }
    this.multiball = false; this.finalT = 0;
    const base = this.dwarfs * 5000 + this.mageDone * 15000 + this.mushroomHits * 300 + this.ramps * 4000 + this.towerLocks * 10000;
    const bonus = base * this.bonusX;
    this.score += bonus;
    this.ui.bonus(bonus, this.bonusX);
    this.ramps = 0;
    this.combo = 0;
    this.later(2.6, () => this.nextTurn());
  }

  nextTurn() {
    this.bonusX = 1;
    this.ballNum++;
    this.savePlayerState();
    const n = this.players.length;
    const next = (this.cur + 1) % n;
    const nextBall = this.players[next].state ? this.players[next].state.ballNum : 1;
    if (nextBall > this.maxBalls) { this.gameOver(); return; }
    if (next !== this.cur) { this.cur = next; this.loadPlayerState(); }
    this.world.setMood('normal');
    this.newBall();
    const last = this.ballNum === this.maxBalls ? 'כדור אחרון!' : '';
    if (n > 1) this.ui.message(`תור של ${this.player.name}`, `כדור ${this.ballNum}${last ? ' · ' + last : ''}`, '#ffe08a', 2);
    else this.ui.message(`כדור ${this.ballNum}`, last, '#ffe08a', 1.6);
  }

  // insights for one player's finished game
  insights(st, score) {
    const out = [];
    const d = st.stats.drains, lost = d.center + d.L + d.R;
    if (lost) {
      const worst = Object.entries(d).sort((a, b) => b[1] - a[1])[0];
      const where = { center: 'במרכז, בין הפליפרים', L: 'בתעלת הצד השמאלית', R: 'בתעלת הצד הימנית' }[worst[0]];
      if (worst[1] > 0) out.push(`רוב הכדורים אבדו ${where} (${worst[1]}/${lost})`);
    }
    const best = Object.entries(st.stats.shots).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) out.push(`המכה הכי מוצלחת: ${SHOT_NAMES[best[0]]} ×${best[1]}`);
    else out.push('נסו לכוון לרמפות: הן שוות הכי הרבה');
    if (st.stats.ballTimes.length) out.push(`זמן ממוצע לכדור: ${Math.round(st.stats.ballTimes.reduce((a, b) => a + b, 0) / st.stats.ballTimes.length)} שניות`);
    if (!st.stats.shots.towerRamp) out.push('טיפ: רמפת המגדל נפתחת בקלות מהפליפר הימני, כשהכדור באמצע הפליפר');
    else if (!st.stats.shots.crystal) out.push('טיפ: לרמפת הקריסטל מכוונים מקצה הפליפר השמאלי');
    return out.slice(0, 4);
  }

  gameOver() {
    if (this.state !== 'playing') return;
    if (this.practice) { this.state = 'over'; this.ui.practiceOver?.(this.practice, this.practiceStats); return; }
    this.savePlayerState();
    this.state = 'over';
    this.sound.play('gameover');
    this.sound.intensity = 0;
    const results = this.players.filter((p) => p.state).map((p) => {
      const st = p.state;
      const best = this.bests[p.id];
      const prev = best.score;
      const newRecord = st.score > best.score;
      best.games = (best.games || 0) + 1;
      if (newRecord) best.score = st.score;
      if (st.bestCombo > (best.combo || 0)) best.combo = st.bestCombo;
      Store.saveBest(p.id, best);
      Store.pushHistory(p.id, { t: Date.now(), score: st.score, combo: st.bestCombo, ach: [...st.gameAch], drains: st.stats.drains, shots: st.stats.shots, players: this.players.length });
      return { id: p.id, name: p.name, score: st.score, newRecord, prevBest: prev, best, combo: st.bestCombo, ach: [...st.gameAch], insights: this.insights(st, st.score) };
    });
    Store.clearSave();
    const r = results[0];
    this.ui.gameOver({ ...r, players: results.length > 1 ? [...results].sort((a, b) => b.score - a.score) : null });
  }

  // ------------------------------------------------------------------ what to do next
  nextGoal() {
    if (this.practice) { const p = this.practiceStats; return `🎯 אימון ${PRACTICE[this.practice].name}: ${p.hits}/${p.tries}${p.tries ? ` (${Math.round((p.hits / p.tries) * 100)}%)` : ''}`; }
    if (this.multiball === 'final') return `⚔️ הקרב האחרון: ${Math.ceil(this.finalT)} שניות · כל מכה = ג׳קפוט`;
    if (this.finalReady) return '⚔️ הקרב האחרון מוכן: חור המגדל';
    if (this.multiball === 'castle') return `👑 רמפת הקריסטל = ג׳קפוט (${this.jackpots}/3)`;
    if (this.multiball === 'wizard') return '🔥 ג׳קפוט: חור המגדל, הרמפות וההקפה';
    if (this.gateOpen) return '🏰 השער פתוח: הכניסו כדור לטירה';
    if (this.dwarfs >= 7) return '⛏️ המטמון מוכן: היכנסו למכרה';
    if (this.towerLocks === 2) return '🔥 עוד נעילה אחת במגדל: מולטיבול';
    if (this.mysteryLit) return '❓ חור המסתורין דולק';
    const opts = [
      [3 - this.castleHits, `🏰 עוד ${3 - this.castleHits} פגיעות בשער הטירה`],
      [3 - this.towerLocks, `🔥 נעילות מגדל ${this.towerLocks}/3`],
      [(7 - this.dwarfs) / 2, `⛏️ גמדים ${this.dwarfs}/7: רמפות, הקפות ומכרה`],
      [this.mage.filter((m) => !m).length, `✨ חסר ב-M-A-G-E: ${'MAGE'.split('').filter((c, i) => !this.mage[i]).join(' ')}`],
    ];
    return opts.sort((a, b) => a[0] - b[0])[0][1];
  }

  // ------------------------------------------------------------------ save / restore (auto-save)
  serialize() {
    if (this.state !== 'playing' || this.practice) return null;
    this.savePlayerState();
    const balls = this.phys.balls.map((b) => {
      if (b.mode === 'rail') { const ex = L.ramps[b.railName].exit; const end = b.rail.samples[b.rail.samples.length - 1]; return { x: end.x, y: end.y, vx: ex.vx, vy: ex.vy }; }
      if (b.mode === 'held') { const h = this.holds.find((hd) => hd.b === b)?.h; const o = h?.out || [b.x, b.y + 20]; return { x: o[0], y: o[1], vx: h ? h.kick.vx : 0, vy: h ? h.kick.vy : 200 }; }
      return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, launched: !!b.launched };
    });
    return {
      v: 1, t: Date.now(), cur: this.cur, players: this.players.map((p) => ({ id: p.id, name: p.name, state: p.state ? { ...p.state, gameAch: [...p.state.gameAch] } : null })),
      table: { drops: this.drops, kick: this.kick, ballSave: this.ballSave, mult: this.mult, mushroomHits: this.mushroomHits, castleMode: this.castleMode, multiball: this.multiball, jackpots: this.jackpots, finalT: this.finalT, finalJackpot: this.finalJackpot, towerRampBoost: this.towerRampBoost, ballSaveArmed: this.ballSaveArmed },
      balls: balls.length ? balls : [{ x: L.PLUNGER.x, y: L.PLUNGER.y, vx: 0, vy: 0, launched: false }],
    };
  }
  restore(sv) {
    this.startGame({ players: sv.players.map((p) => ({ id: p.id, name: p.name })) });
    this.phys.balls.length = 0;
    this.players.forEach((p, i) => { const st = sv.players[i].state; p.state = st ? { ...st, gameAch: new Set(st.gameAch) } : null; });
    this.cur = sv.cur;
    this.loadPlayerState();
    const tb = sv.table;
    Object.assign(this, { drops: [false, false, false], kick: tb.kick, ballSave: tb.ballSave, mult: tb.mult, mushroomHits: tb.mushroomHits, jackpots: tb.jackpots,
      finalT: tb.finalT, finalJackpot: tb.finalJackpot, towerRampBoost: tb.towerRampBoost, ballSaveArmed: tb.ballSaveArmed });
    // multiball keeps going only if its balls came back too
    const many = sv.balls.length > 1;
    this.multiball = many ? tb.multiball : false;
    this.castleMode = many && tb.castleMode;
    if (this.castleMode) this.world.fx('princess', { on: true });
    for (const bb of sv.balls) { const b = this.phys.addBall(bb.x, bb.y, bb.vx, bb.vy); b.launched = bb.launched !== false; b.noCap = this.time + 0.5; }
    this.sound.intensity = this.multiball ? 1 : 0;
    this.world.setMood(this.moodName());
    this.ui.message('ממשיכים מאיפה שעצרת', this.players.length > 1 ? `תור של ${this.player.name}` : `כדור ${this.ballNum}`, '#9fe0ff', 2.2);
  }

  // ------------------------------------------------------------------ lamps
  updateLamps() {
    const W = this.world, set = (n, s) => { const l = W.lamps.get(n); if (l) l.set(s); };
    for (let i = 0; i < 3; i++) { set('tower_lock_' + i, i < this.towerLocks ? 1 : i === this.towerLocks ? 2 : 0); set('lockf_' + i, i < this.towerLocks ? 1 : 0); }
    set('tower_door', this.multiball === 'wizard' ? 3 : this.towerLocks === 2 ? 2 : 0);
    set('tower_rune', this.multiball === 'wizard' ? 3 : 1);
    set('hole_tower', this.finalReady || this.multiball === 'final' || this.towerLocks === 2 || this.multiball === 'wizard' ? 3 : 2);
    set('arrow_towerHole', this.finalReady || this.towerLocks === 2 ? 3 : 2);
    set('arrow_towerRamp', this.multiball === 'wizard' ? 3 : this.towerRampBoost ? 1 : 2);
    for (let i = 0; i < 3; i++) { set('castle_gate_' + i, this.gateOpen || i < this.castleHits ? 1 : 0); set('gatef_' + i, this.gateOpen || i < this.castleHits ? 1 : 0); }
    set('castle_inside', this.gateOpen ? 2 : this.castleMode ? 1 : 0);
    set('hole_castle', this.gateOpen ? 3 : 0);
    set('arrow_castle', this.gateOpen ? 3 : 2);
    set('arrow_crystal', this.castleMode ? 3 : this.multiball ? 2 : 1); set('arrow_orbit', this.multiball === 'wizard' ? 3 : 2);
    set('crystal_glow', this.castleMode ? 2 : 0);
    set('arrow_bumpers', this.skillWindow > 0 ? 3 : this.mult > 1 ? 1 : 0);
    for (let i = 0; i < 7; i++) set('dwarf_' + i, this.dwarfs === 7 ? 3 : i < this.dwarfs ? 1 : 0);
    set('hole_mine', this.dwarfs === 7 ? 3 : 0); set('mine_inside', this.dwarfs === 7 ? 2 : 0);
    set('arrow_mine', this.dwarfs === 7 ? 3 : 0);
    set('hole_mystery', this.mysteryLit ? 3 : 0); set('hole_mystery2', this.mysteryLit ? 3 : 0); set('arrow_mystery', this.mysteryLit ? 2 : 0);
    'MAGE'.split('').forEach((c, i) => set('mage_' + c, this.mage[i] ? 1 : 0));
    set('kick_L', this.kick.L ? 1 : 0); set('kick_R', this.kick.R ? 1 : 0);
    ['2', '3', '4', '5'].forEach((n) => set('bx_' + n, this.bonusX >= +n ? 1 : 0));
    set('ballsave', this.ballSave > 3 ? 2 : this.ballSave > 0 ? 3 : 0);
    for (let i = 0; i < 3; i++) { set('drop_' + i, this.drops[i] ? 0 : 1); set('shield_' + i, this.shields[i] ? 1 : 0); }
  }
}
