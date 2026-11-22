// Sound effects wiring: which game event plays which sound, and from where on the table (stereo).
// Presentation only – listens to the EventBus, never changes the game.

/** stereo position of a flat-table x (0..21) and of a painting x (0..1284) */
export const panF = (x) => Math.max(-0.9, Math.min(0.9, ((x - 10.5) / 10.5) * 0.85));
export const panA = (x) => Math.max(-0.9, Math.min(0.9, ((x - 640) / 640) * 0.85));

export function bindSound(bus, audio) {
  let lastThud = 0;
  // stereo: every sound comes from where it happens on the table (flat x 0..21, centre 10.5; painting x 0..1284)
  const LANE_PAN = [panA(150), panA(238), panA(1042), panA(1130)];
  bus.on('flipper', ({ side, pressed }) => audio.play(side === 'L' ? -0.45 : 0.45, 'flipper', pressed));
  bus.on('contact', (c) => {
    const now = performance.now();
    const pan = panF(c.x);
    if (c.kind === 'sling') audio.play(pan, 'sling');
    else if (c.kind === 'gate' || c.kind === 'post') audio.play(pan, 'metalClick');
    else if ((c.kind === 'wall' || c.kind === 'flipper') && c.impact > 7 && now - lastThud > 45) { lastThud = now; audio.play(pan, 'thud', c.impact); }
  });
  bus.on('element', ({ id, x }) => {
    const pan = x !== undefined && x !== null ? panF(x) : 0;
    if (id.startsWith('mush')) { audio.play(pan, 'bumperThump'); audio.play(pan, 'mushroomBell'); } else if (id.startsWith('crystal')) audio.play(pan, 'crystal'); else if (id === 'potion') audio.play(pan, 'potion');
  });
  bus.on('wizardHit', () => audio.play(panA(834), 'wizardSpell'));
  bus.on('launch', ({ power }) => audio.play(0.85, 'launch', power));
  bus.on('plungerPull', () => audio.play(0.85, 'plungerPull'));
  bus.on('railEnter', ({ id }) => audio.play(id === 'rampA' ? panA(800) : panA(490), 'metalClick'));
  bus.on('ramp', () => audio.rampDone());
  bus.on('kickbackFire', ({ x }) => audio.play(panF(x), 'kickback'));
  bus.on('skillShot', () => audio.skillShot());
  bus.on('drain', () => { audio.drain(); audio.troughDrop(); });
  bus.on('ballSpawn', ({ where }) => { if (where === 'plunger') audio.play(0.85, 'troughKick'); });
  bus.on('rollover', ({ index }) => audio.play(LANE_PAN[index], 'rollover'));
  bus.on('ballLost', () => audio.ballLost());
  bus.on('nudge', () => audio.thud(26));
  bus.on('scoopCapture', () => { audio.play(panA(395), 'thud', 30); audio.play(panA(395), 'metalClick'); });
  bus.on('scoopEject', () => audio.play(panA(395), 'scoopKick'));
  bus.on('mystery', () => audio.rampDone());
  bus.on('extraBallLit', () => audio.skillShot());
  bus.on('extraBall', () => { audio.knocker(); audio.superJackpot(); });
  bus.on('shootAgain', () => audio.chapter());
  bus.on('laneLit', ({ index }) => audio.play(LANE_PAN[index], 'metalClick'));
  bus.on('bonusX', () => audio.rampDone());
  bus.on('bonus', () => audio.rampDone());
  bus.on('poolLit', () => audio.play(0, 'potion'));
  bus.on('poolJackpot', () => audio.superJackpot());
  bus.on('crystalLit', () => audio.crystal());
  bus.on('crystalJackpot', () => audio.superJackpot());
  bus.on('doubleOrbit', () => audio.skillShot());
  bus.on('frenzyStart', () => audio.rushStart());
  bus.on('chapterMission', () => audio.superJackpot());
  bus.on('hurryUp', () => audio.skillShot());
  bus.on('dragonReady', () => audio.towerOpen());
  bus.on('dragonStart', () => { audio.towerEnter(); audio.rushStart(); });
  bus.on('dragonJackpot', () => audio.crystal());
  bus.on('dragonWave', () => audio.superJackpot());
  bus.on('dragonEnd', ({ completed }) => { if (completed) audio.chapter(); });
  bus.on('ballLock', () => { audio.towerEnter(); });
  bus.on('addABall', () => audio.superJackpot());
  bus.on('superSkillArmed', () => audio.metalClick());
  bus.on('superSkillShot', () => audio.superJackpot());
  bus.on('match', ({ won }) => { if (won) { audio.knocker(); audio.superJackpot(); } });
  bus.on('tiltWarning', () => audio.doorThud());
  bus.on('tilt', () => audio.ballLost());
  bus.on('doorOpen', () => audio.towerOpen());
  bus.on('doorThud', () => audio.doorThud());
  bus.on('towerEnter', () => audio.towerEnter());
  bus.on('superJackpot', () => audio.superJackpot());
  bus.on('ballDissolve', () => { if (audio.ready) audio.bell(1568, 0.08); });
  bus.on('loop', () => audio.rampDone());
}
