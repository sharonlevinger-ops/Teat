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

export const PHYS = Object.freeze({
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
});
