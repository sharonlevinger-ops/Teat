// v3 features: profiles & migration, daily challenge streak, history, multiplayer turns,
// auto-save round trip, final battle, practice mode, next-goal line, settings.
import test from 'node:test';
import assert from 'node:assert';

const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const reset = () => { for (const k of Object.keys(mem)) delete mem[k]; };

const Store = await import('../js/store.js');
const { Physics } = await import('../js/physics.js');
const { Game } = await import('../js/game.js');
const L = await import('../js/layout.js');

const world = { lamps: new Map(), fx() {}, setMood() {} };
const sound = { play() {}, setRoll() {}, intensity: 0 };
const msgs = [];
const ui = { message: (t, s) => msgs.push(t + ' ' + (s || '')), popup() {}, toast: (t) => msgs.push(t), bonus() {}, gameOver: (r) => { ui.result = r; }, practiceOver: (k, st) => { ui.practice = st; } };
const mk = (settings = {}) => { const p = new Physics(); const g = new Game(p, world, sound, ui, { ...Store.DEFAULT_SETTINGS, ...settings }); g.applySettings(g.settings); return { p, g }; };
const run = (p, g, sec) => { for (let t = 0; t < sec; t += 1 / 60) { p.step(1 / 60); g.update(1 / 60); } };
const drainNow = (p, g) => { g.ballSave = 0; for (const b of [...p.balls]) { b.mode = 'field'; b.x = L.CX; b.y = L.DRAIN_Y + 4; } g.update(0.016); run(p, g, 3); };

test('profiles: old record migrates to Sharon, add / remove players', () => {
  reset();
  mem.fcp_best_v1 = JSON.stringify({ score: 123456, combo: 3, games: 7, achievements: ['wizard'] });
  const pr = Store.loadProfiles();
  assert.equal(pr.list[0].name, 'שרון');
  assert.equal(Store.loadBest('sharon').score, 123456, 'legacy record kept');
  const id = Store.addProfile(pr, 'נועה');
  assert.ok(id);
  assert.equal(Store.addProfile(pr, 'נועה'), null, 'no duplicate names');
  assert.equal(Store.removeProfile(pr, id), true);
  assert.equal(pr.list.length, 1);
  assert.equal(Store.removeProfile(pr, 'sharon'), false, 'last profile cannot be removed');
});

test('daily challenge: streak grows on consecutive days and resets after a gap', () => {
  reset();
  const d1 = new Date(2026, 10, 20), d2 = new Date(2026, 10, 21), d4 = new Date(2026, 10, 23);
  assert.equal(Store.completeDaily('sharon', d1).streak, 1);
  assert.equal(Store.completeDaily('sharon', d2).streak, 2);
  assert.equal(Store.completeDaily('sharon', d2).already, true, 'once per day');
  assert.equal(Store.completeDaily('sharon', d4).streak, 1, 'gap resets');
  assert.ok(Store.todayChallenge(d1).text);
  assert.notEqual(Store.todayChallenge(d1).id, Store.todayChallenge(d2).id, 'changes every day');
});

test('history summary: average and trend', () => {
  reset();
  for (let i = 0; i < 20; i++) Store.pushHistory('sharon', { t: i, score: i < 10 ? 100000 : 200000 });
  const s = Store.historySummary(Store.loadHistory('sharon'));
  assert.equal(Math.round(s.avg), 200000);
  assert.ok(s.trend > 0.9, 'up ~100%');
  assert.equal(s.recent.length, 5);
});

test('multiplayer: players alternate balls and the game ends after everyone played all balls', () => {
  reset();
  const { p, g } = mk({ balls: 3 });
  g.startGame({ players: [{ id: 'a', name: 'א' }, { id: 'b', name: 'ב' }] });
  const order = [];
  for (let i = 0; i < 6; i++) { order.push(g.player.name + g.ballNum); g.score += 1000 * (g.cur + 1); drainNow(p, g); }
  assert.deepEqual(order, ['א1', 'ב1', 'א2', 'ב2', 'א3', 'ב3']);
  assert.equal(g.state, 'over');
  assert.equal(ui.result.players.length, 2);
  assert.equal(ui.result.players[0].name, 'ב', 'ranking by score');
  assert.ok(Store.loadBest('a').score > 0 && Store.loadBest('b').score > 0, 'each player keeps an own record');
  assert.equal(Store.loadHistory('a').length, 1);
});

test('multiplayer: progress is per player (tower locks do not leak to the other player)', () => {
  reset();
  const { p, g } = mk();
  g.startGame({ players: [{ id: 'a', name: 'א' }, { id: 'b', name: 'ב' }] });
  g.towerLocks = 2; g.dwarfs = 5;
  drainNow(p, g);
  assert.equal(g.player.name, 'ב');
  assert.equal(g.towerLocks, 0); assert.equal(g.dwarfs, 0);
  drainNow(p, g);
  assert.equal(g.player.name, 'א');
  assert.equal(g.towerLocks, 2); assert.equal(g.dwarfs, 5);
});

test('auto-save: serialize and restore an interrupted game', () => {
  reset();
  const { p, g } = mk();
  g.startGame({ players: [{ id: 'sharon', name: 'שרון' }] });
  g.score = 345000; g.towerLocks = 2; g.dwarfs = 4; g.gateOpen = true; g.castleHits = 3;
  const b = p.balls[0]; b.x = 360; b.y = 700; b.vx = 100; b.vy = 50; b.launched = true;
  const sv = JSON.parse(JSON.stringify(g.serialize()));
  assert.equal(sv.v, 1);
  const n = mk();
  n.g.restore(sv);
  assert.equal(n.g.state, 'playing');
  assert.equal(n.g.score, 345000);
  assert.equal(n.g.towerLocks, 2); assert.equal(n.g.dwarfs, 4); assert.equal(n.g.gateOpen, true);
  assert.equal(L.castleGate.seg.enabled, false, 'open gate restored on the table');
  assert.equal(n.p.balls.length, 1);
  assert.equal(Math.round(n.p.balls[0].x), 360);
  assert.equal(g.serialize() !== null, true);
});

test('final battle: unlocked by wizard + castle + treasure, started from the tower hole, ends on time', () => {
  reset();
  const { p, g } = mk();
  g.startGame({ players: [{ id: 'sharon', name: 'שרון' }] });
  g.flags.wizard = true; g.flags.castle = true; g.flags.treasure = true;
  g.checkFinalReady();
  assert.equal(g.finalReady, true);
  assert.match(g.nextGoal(), /הקרב האחרון/);
  const hole = L.holes.find((h) => h.id === 'tower');
  const b = p.balls[0]; b.mode = 'field'; b.launched = true; b.noCap = 0; b.x = hole.x; b.y = hole.y + 30; b.vx = 0; b.vy = -400;
  run(p, g, 4);
  assert.equal(g.multiball, 'final');
  const before = g.score;
  g.finalHit(300, 600);
  assert.ok(g.score - before >= 150000, 'every shot is a jackpot');
  g.finalT = 0.01; run(p, g, 0.1);
  assert.notEqual(g.multiball, 'final', 'ends when the time is up');
});

test('practice: ball is fed again and again, hits counted, no score', () => {
  reset();
  const { p, g } = mk();
  g.startGame({ players: [{ id: 'sharon', name: 'שרון' }], practice: 'crystal' });
  assert.equal(g.practiceStats.tries, 1);
  g.onRailExit(p.balls[0], 'crystal');
  assert.equal(g.practiceStats.hits, 1);
  g.onRailExit(p.balls[0], 'tower'); // wrong ramp does not count
  assert.equal(g.practiceStats.hits, 1);
  drainNow(p, g);
  assert.ok(g.practiceStats.tries >= 2, 'refed after a drain');
  assert.equal(g.score, 0);
  assert.equal(g.state, 'playing');
  assert.match(g.nextGoal(), /אימון/);
  g.gameOver();
  assert.equal(ui.practice.hits, 1);
});

test('next goal follows the game state', () => {
  reset();
  const { g } = mk();
  g.startGame({ players: [{ id: 'sharon', name: 'שרון' }] });
  g.castleHits = 2; assert.match(g.nextGoal(), /שער הטירה/);
  g.dwarfs = 7; assert.match(g.nextGoal(), /המטמון מוכן/);
  g.gateOpen = true; assert.match(g.nextGoal(), /השער פתוח/);
});

test('settings: difficulty changes the centre post, speed scales gravity, balls per game', () => {
  reset();
  const { p, g } = mk({ difficulty: 'hard', speed: 1.15, balls: 5 });
  const post = p.circles.find((c) => c.x === L.CENTER_POST.x && c.y === L.CENTER_POST.y);
  assert.equal(post.enabled, false);
  assert.equal(p.gravityScale, 1.15);
  g.applySettings({ ...g.settings, difficulty: 'normal' });
  assert.equal(post.enabled, true); assert.ok(post.r < L.CENTER_POST.r);
  g.startGame({ players: [{ id: 'sharon', name: 'שרון' }] });
  for (let i = 0; i < 4; i++) drainNow(p, g);
  assert.equal(g.state, 'playing', '5 balls');
  drainNow(p, g);
  assert.equal(g.state, 'over');
});

test('insights describe how balls were lost and the best shot', () => {
  reset();
  const { g } = mk();
  g.startGame({ players: [{ id: 'sharon', name: 'שרון' }] });
  const st = { stats: { drains: { center: 0, L: 2, R: 1 }, shots: { towerRamp: 0, crystal: 4, orbit: 1, tower: 0, castle: 0, mine: 0, mystery: 0 }, ballTimes: [30, 50] } };
  const ins = g.insights(st, 1000);
  assert.ok(ins.some((t) => t.includes('השמאלית')));
  assert.ok(ins.some((t) => t.includes('רמפת הקריסטל ×4')));
  assert.ok(ins.some((t) => t.includes('40 שניות')));
});
