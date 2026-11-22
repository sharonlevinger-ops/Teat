// Voice callouts wiring: what the wizard says, and how urgent it is (3 cuts in, 1 only if quiet).

export function bindVoice(bus, voice) {
  // ------------------------------------------------------------------ voice callouts (the wizard speaks)
  const say = (t, p) => voice.say(t, p);
  const words = ['one', 'two', 'three'];
  bus.on('skillShot', () => say('Skill shot!', 3));
  bus.on('superSkillShot', () => say('Super skill shot!', 3));
  bus.on('doorOpen', () => say('The tower is open!', 2));
  bus.on('ballLock', ({ count }) => say(`Ball ${words[count - 1] || count} locked`, 3));
  bus.on('multiballStart', () => say('Multiball!', 3));
  bus.on('superJackpot', () => say('Super jackpot!', 3));
  bus.on('addABall', () => say('Add a ball!', 3));
  bus.on('rushStart', () => say('Rush combo!', 3));
  bus.on('frenzyStart', () => say('Spore frenzy!', 2));
  bus.on('poolJackpot', () => say('Pool jackpot!', 3));
  bus.on('crystalJackpot', () => say('Crystal jackpot!', 3));
  bus.on('doubleOrbit', () => say('Double orbit!', 2));
  bus.on('extraBallLit', () => say('Extra ball is lit', 2));
  bus.on('extraBall', () => say('Extra ball!', 3));
  bus.on('shootAgain', () => say('Shoot again', 2));
  bus.on('ballSaved', () => say('Ball saved', 2));
  bus.on('kickbackFire', () => say('Kickback!', 1));
  bus.on('mystery', () => say('Mystery', 1));
  bus.on('dragonReady', () => say("Dragon's fire is ready", 2));
  bus.on('dragonStart', () => say("Dragon's fire! Strike every flame!", 3));
  bus.on('dragonWave', () => say('Wave cleared!', 3));
  bus.on('dragonEnd', ({ completed, victory }) => { if (completed) say(victory ? 'The dragon is defeated!' : 'The dragon sleeps', 3); });
  bus.on('chapterMission', () => say('Mission complete', 2));
  bus.on('stage', ({ index, initial }) => { if (!initial) say(['The forest awakens', 'Night falls', "The dragon's gate"][index] || 'New chapter', 3); });
  bus.on('tiltWarning', () => say('Careful', 2));
  bus.on('tilt', () => say('Tilt!', 3));
  bus.on('bonusX', ({ x }) => say(`Bonus times ${x}`, 1));
  bus.on('match', ({ won }) => { if (won) say('Match! One more ball', 3); });
  bus.on('gameOver', ({ newHigh }) => say(newHigh ? 'A new high score!' : 'Game over', 3));
  bus.on('gameStart', () => say('Welcome to the enchanted forest', 2));
}
