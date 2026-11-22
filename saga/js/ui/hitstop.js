// Hit-stop: big moments freeze the ball for a split second (the table "holds its breath").
// Returns a controller; the main loop skips simulation steps while it is active.

/** event -> freeze time in seconds */
export const HIT_STOPS = [
  ['superJackpot', 0.07], ['towerEnter', 0.09], ['ballLock', 0.07], ['dragonWave', 0.09], ['dragonStart', 0.09],
  ['crystalJackpot', 0.06], ['poolJackpot', 0.06], ['doubleOrbit', 0.05], ['superSkillShot', 0.07], ['skillShot', 0.05],
  ['extraBall', 0.06], ['addABall', 0.05], ['chapterMission', 0.06], ['dragonJackpot', 0.035], ['scoopCapture', 0.04],
];

export function bindHitStop(bus) {
  let hitStop = 0;
  const freeze = (s) => { hitStop = Math.max(hitStop, s); };
  for (const [ev, s] of HIT_STOPS) bus.on(ev, () => freeze(s));
  return { get active() { return hitStop > 0; }, tick(dt) { hitStop -= dt; } };
}
