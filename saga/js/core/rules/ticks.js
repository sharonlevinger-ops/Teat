// Shared timer table (integer ticks at the fixed simulation rate) and helpers used by every rules module.
import { TIMING, TILT, MODES, secToTicks } from '../config.js';

export const T = {
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
  POOL_CD: secToTicks(0.5),
  LOCK_RELAUNCH: secToTicks(MODES.LOCK_RELAUNCH),
  ADD_TIME: secToTicks(MODES.ADD_A_BALL_TIME),
  SUPER: secToTicks(MODES.SUPER_SKILL_WINDOW),
};
export const MYSTERY_TOTAL = MODES.MYSTERY.reduce((a, [w]) => a + w, 0);
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
