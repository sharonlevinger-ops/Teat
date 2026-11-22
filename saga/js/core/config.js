// Forest Pinball Saga – game constants. Pure data, no DOM, no rendering.

/** Fixed simulation rate. All game timers count whole ticks of this step, so they are exact. */
export const HZ = 120;
export const STEP = 1 / HZ;
export const secToTicks = (s) => Math.round(s * HZ);

export const SCORE = Object.freeze({
  SKILL_SHOT: 5000,
  FLIPPER: 10,
  ELEMENT: 100, // mushroom / crystal / potion
  WIZARD: 250,
  LOOP: 500,
  RAMP: 500,
  DOOR_OPEN: 1000,
  TOWER_ENTRY: 15000,
  SUPER_JACKPOT: 25000,
  SLING: 500, // every slingshot kick
  COMBO_CHAIN: 250, // × (chain level − 1) for each chained hit
});

export const TIMING = Object.freeze({
  RUSH: 30,
  DOOR_OPEN: 10, // the tower door stays open 10 s after the wizard is fully charged
  MULTIBALL: 60,
  SKILL_PERIOD: 1.6, // skill-shot indicator cycle
  SKILL_LIT: 0.6, // indicator is lit for this long at the start of each cycle
  SKILL_TIMEOUT: 4, // armed skill shot must connect within this time after leaving the lane
  LAUNCH_COOLDOWN: 0.6,
  PLUNGER_FULL: 0.9, // seconds of holding for full plunger power
  MB_AUTOLAUNCH: 0.5,
  MB_ORIGINAL_EJECT: 1.2, // the captured ball returns this long after the 3 new balls
  STAGE_FADE: 3.0,
  ELEMENT_COOLDOWN: 0.15,
  FLIPPER_SCORE_COOLDOWN: 0.25,
  DOOR_HIT_COOLDOWN: 0.5,
  LOOP_WINDOW: 4.0,
  COMBO_WINDOW: 3.0, // ramps / loops / elements hit within this time chain into a combo
  BALL_SAVE: 6, // a ball lost within 6 s of reaching the playfield comes back (once per ball)
});
export const COMBO_MAX = 9;

/** Nudging the table (swipe up): every nudge adds 1 to the danger level, which drains at DECAY per second.
 *  Reaching LIMIT gives a warning; after WARNINGS warnings the next one is TILT (flippers die for that ball). */
/** Table features beyond the core spec (all values in base points before multipliers, times in seconds). */
export const MODES = Object.freeze({
  SCOOP_BASE: 1000,
  MYSTERY: [ // weight, award
    [22, 'points5k'], [16, 'points10k'], [5, 'points25k'], [14, 'kickbacks'], [12, 'ballSave'], [12, 'boost'], [12, 'wizard'], [4, 'extraBall'],
  ],
  MYSTERY_SAVE: 10,
  BOOST_SECONDS: 15, BOOST_MULT: 2,
  POOL_PASS: 100, POOL_JACKPOT: 10000, POOL_STEP: 2500, POOL_MAX: 40000,
  LANE_POINTS: 250, LANE_COMPLETE: 2000, BONUS_X_MAX: 5,
  BONUS: { mush: 100, crystal: 200, potion: 200, wizard: 300, sling: 20, ramp: 1000, loop: 1000, scoop: 1000, lane: 250, pool: 250 },
  EXTRA_BALL_RUSHES: 2,
  // Dragon's Fire: every target below is lit once; hitting a lit one is a jackpot and puts it out.
  // Putting all of them out is a wave (+ WAVE award); the targets relight worth DRAGON_STEP more.
  DRAGON_SECONDS: 45, DRAGON_JACKPOT: 5000, DRAGON_STEP: 2500, DRAGON_WAVE: 25000, DRAGON_COMPLETE: 50000,
  DRAGON_TARGETS: ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'wizard', 'rampA', 'rampB', 'tower'],
  LEVEL_STEP: 0.5, // each saga level: chapter multipliers +0.5, chapter thresholds +50 %
  HURRY_START: 20000, HURRY_END: 5000,
  FRENZY_SECONDS: 20, FRENZY_MULT: 5,
  CRYSTAL_JACKPOT: 15000, CRYSTAL_STEP: 5000, CRYSTAL_MAX: 50000,
  DOUBLE_ORBIT: 10000, DOUBLE_ORBIT_STEP: 5000, DOUBLE_ORBIT_MAX: 40000,
  // the tower locks balls: 2 locks, then the 3rd entry starts the multiball (locks persist through the game)
  LOCK_POINTS: 5000, LOCK_RELAUNCH: 1.2, // how many locks: TUNE.LOCKS
  ADD_A_BALL_MAX: 1, ADD_A_BALL_TIME: 10, ADD_A_BALL_POINTS: 5000, // scoop during multiball
  SUPER_SKILL: 15000, SUPER_SKILL_WINDOW: 12, // hold the left flipper while launching, then hit the golden ramp
  MISSIONS: [ // one per chapter
    { id: 'ring', name: 'MUSHROOM RING', text: 'HIT ALL 3 MUSHROOMS', n: 3, award: 10000 },
    { id: 'moon', name: 'MOONLIT RAMPS', text: 'RIDE 4 RAMPS', n: 4, award: 20000 },
    { id: 'dragon', name: 'DRAGON AWAKENS', text: 'HIT THE TOWER 5 TIMES', n: 5, award: 30000 },
  ],
});
export const LANES = Object.freeze(['M', 'A', 'G', 'E']); // outlane L, inlane L, inlane R, outlane R

/** Feature values the designer tuning panel may change live (not frozen; read at the moment they are used). */
export const TUNE = {
  SCOOP_CATCH: 60, // the Mystery Scoop catches balls slower than this
  FRENZY_HITS: 25, // mushroom hits to start Spore Frenzy
  POOL_PASSES: 5, // pool passes to light the Pool Jackpot
  CRYSTAL_SEQ: 4, // alternating crystal hits to light the Crystal Jackpot
  DOUBLE_ORBIT_WINDOW: 6, // seconds between the two ramps for a Double Orbit
  LOCKS: 2, // balls locked in the tower before the multiball (0 = the first entry starts it)
};
export const TUNE_DEFAULTS = Object.freeze({ ...TUNE });

/** The Mystery Scoop (kickout hole): catches balls slower than CATCH_SPEED, holds them, kicks them out. */
export const SCOOP = Object.freeze({ HOLD: 1.1, EJECT_VX: 4, EJECT_VY: -10, REARM: 0.6 }); // eject aim: measured 0/60 drains

export const TILT = Object.freeze({ NUDGE_VX: 4.5, NUDGE_VY: 7, DECAY: 0.55, LIMIT: 2.5, WARNINGS: 2, COOLDOWN: 0.25 });

export const STAGES = Object.freeze([
  { id: 1, min: 0, mult: 1.0, title: 'CHAPTER 1: ENCHANTED FOREST' },
  { id: 2, min: 15000, mult: 1.5, title: "CHAPTER 2: NIGHT'S MAGIC" },
  { id: 3, min: 40000, mult: 2.0, title: "CHAPTER 3: DRAGON'S GATE" },
]);

export const RUSH_MULT = 2.0;
export const BALLS_PER_GAME = 3;
export const WIZARD_CHARGES = 3;
export const RUSH_ELEMENTS = Object.freeze(['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion']);
export const SKILL_TARGET = 'mush3';
export const MAX_BALLS = 4;

// Not frozen: the hidden designer tuning panel (ui/tuning.js) adjusts a few of these live.
export const PHYS = {
  // Physics runs at 75% of real time: same trajectories, calmer ball. Game timers stay real time.
  TIME_SCALE: 0.75,
  BALL_R: 0.5,
  GRAVITY: 50, // table units / s² along the (tilted) playfield
  MAX_SPEED: 95,
  LINEAR_DAMP: 0.08, // rolling resistance per second
  MAX_MOVE_FRACTION: 0.3, // a ball never moves more than 0.3·r per sub-step (continuous collision)
  MAX_SUBSTEPS: 48,
  REST_SPEED: 1.2, // impacts slower than this don't bounce (kills jitter)
  PLUNGER_MIN: 34,
  PLUNGER_MAX: 72,
  BUMPER_KICK: 27,
  SLING_KICK: 30,
  SLING_MIN_IMPACT: 1.2, // any real touch fires the slingshot
  KICKBACK_SPEED: 54,
  FLIPPER_UP_SPEED: 26, // rad/s
  FLIPPER_DOWN_SPEED: 16,
  STUCK_SPEED: 0.6,
  STUCK_TIME: 3.0,
};

/** Defaults of the values the tuning panel can change (for reset / export). */
export const PHYS_DEFAULTS = Object.freeze({ ...PHYS });
