// Long-term progress kept on the device: three daily missions (new ones every day, a streak for finishing
// all three), achievements, and the high-score table. Pure logic, no DOM: storage is injected
// ({get(key, default), set(key, value)}) and the game events arrive from the EventBus.

const KEY = 'progress';
const MAX_SCORES = 10;

/** Mission pool: `ev` is the game event that counts, `test` filters it, `n` is how many are needed today. */
export const MISSION_POOL = [
  { id: 'wizard10', text: 'Hit the wizard 10 times', ev: 'wizardHit', n: 10 },
  { id: 'door2', text: 'Open the tower door twice', ev: 'doorOpen', n: 2 },
  { id: 'rampB3', text: 'Ride the golden orbit 3 times', ev: 'ramp', test: (p) => p.id === 'rampB', n: 3 },
  { id: 'rampA3', text: 'Ride the crystal ramp 3 times', ev: 'ramp', test: (p) => p.id === 'rampA', n: 3 },
  { id: 'rush1', text: 'Start a RUSH COMBO', ev: 'rushStart', n: 1 },
  { id: 'mb1', text: "Start the wizard's multiball", ev: 'multiballStart', n: 1 },
  { id: 'skill1', text: 'Make a skill shot', ev: 'skillShot', n: 1 },
  { id: 'loop3', text: 'Make 3 loops', ev: 'loop', n: 3 },
  { id: 'mush25', text: 'Hit the mushrooms 25 times', ev: 'element', test: (p) => p.id.startsWith('mush'), n: 25 },
  { id: 'ch2', text: 'Reach chapter 2', ev: 'stage', test: (p) => !p.initial && p.index >= 1, n: 1 },
  { id: 'combo4', text: 'Build a COMBO x4', ev: 'comboChain', test: (p) => p.level >= 4, n: 1 },
  { id: 'score30k', text: 'Score 30,000 in one game', ev: 'score', test: (p) => p.total >= 30000, n: 1 },
];

export const ACHIEVEMENTS = [
  { id: 'skill', name: 'Sharp Shooter', text: 'Make a skill shot', ev: 'skillShot' },
  { id: 'rush', name: 'Rush Hour', text: 'Start a RUSH COMBO', ev: 'rushStart' },
  { id: 'tower', name: 'Tower Guest', text: "Enter the wizard's tower", ev: 'towerEnter' },
  { id: 'jackpot', name: 'Super Jackpot', text: 'Hit the door during multiball', ev: 'superJackpot' },
  { id: 'ch2', name: 'Night Falls', text: 'Reach chapter 2', ev: 'stage', test: (p) => !p.initial && p.index >= 1 },
  { id: 'ch3', name: "Dragon's Gate", text: 'Reach chapter 3', ev: 'stage', test: (p) => !p.initial && p.index >= 2 },
  { id: 'combo5', name: 'Chain Master', text: 'Build a COMBO x5', ev: 'comboChain', test: (p) => p.level >= 5 },
  { id: 'score50k', name: 'Fifty Grand', text: 'Score 50,000 in one game', ev: 'score', test: (p) => p.total >= 50000 },
  { id: 'score100k', name: 'Forest Legend', text: 'Score 100,000 in one game', ev: 'score', test: (p) => p.total >= 100000 },
  { id: 'saved', name: 'Second Chance', text: 'Get a ball saved', ev: 'ballSaved' },
  { id: 'daily', name: 'Daily Hero', text: "Finish all of a day's missions", ev: null },
  { id: 'streak3', name: 'Faithful', text: 'Finish the missions 3 days in a row', ev: null },
];

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** The same three missions for everyone on a given day (seeded by the date). */
export function dailyMissions(key) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const pool = MISSION_POOL.map((m) => m.id);
  const out = [];
  while (out.length < 3) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const id = pool.splice(h % pool.length, 1)[0];
    out.push(id);
  }
  return out;
}

export class Progress {
  constructor(storage, today = () => dayKey()) {
    this.storage = storage;
    this.today = today;
    this.onUnlock = () => {}; // (kind: 'mission' | 'daily' | 'achievement', item) – the UI shows a banner
    const s = storage.get(KEY, null);
    this.state = {
      day: '', missions: [], streak: 0, lastFullDay: '', achievements: {}, scores: [],
      ...(s && typeof s === 'object' ? s : {}),
    };
    if (!Array.isArray(this.state.scores)) this.state.scores = [];
    if (!this.state.achievements || typeof this.state.achievements !== 'object') this.state.achievements = {};
    this._checkDay();
  }

  _save() { this.storage.set(KEY, this.state); }

  /** New day: three new missions (yesterday's progress does not carry over). */
  _checkDay() {
    const key = this.today();
    if (this.state.day === key && Array.isArray(this.state.missions) && this.state.missions.length === 3) return;
    this.state.day = key;
    this.state.missions = dailyMissions(key).map((id) => ({ id, count: 0, done: false }));
    if (this.state.lastFullDay && this.state.lastFullDay !== prevDay(key) && this.state.lastFullDay !== key) this.state.streak = 0;
    this._save();
  }

  get missions() {
    this._checkDay();
    return this.state.missions.map((m) => ({ ...MISSION_POOL.find((p) => p.id === m.id), count: m.count, done: m.done }));
  }

  get streak() { return this.state.streak; }
  get scores() { return this.state.scores; }
  hasAchievement(id) { return !!this.state.achievements[id]; }

  bind(bus) {
    bus.on('*', (type, p) => { if (type !== 'contact' && type !== 'flipper') this.onEvent(type, p || {}); });
  }

  onEvent(type, p) {
    if (type === 'gameStart') this._checkDay();
    let changed = false;
    for (const m of this.state.missions) {
      if (m.done) continue;
      const def = MISSION_POOL.find((x) => x.id === m.id);
      if (!def || def.ev !== type || (def.test && !def.test(p))) continue;
      m.count = Math.min(def.n, m.count + 1);
      changed = true;
      if (m.count >= def.n) { m.done = true; this.onUnlock('mission', def); }
    }
    if (changed && this.state.missions.every((m) => m.done)) this._dayComplete();
    for (const a of ACHIEVEMENTS) {
      if (a.ev === type && !this.state.achievements[a.id] && (!a.test || a.test(p))) { this._unlock(a.id); changed = true; }
    }
    if (changed) this._save();
  }

  _dayComplete() {
    const key = this.state.day;
    if (this.state.lastFullDay === key) return;
    this.state.streak = this.state.lastFullDay === prevDay(key) ? this.state.streak + 1 : 1;
    this.state.lastFullDay = key;
    this.onUnlock('daily', { streak: this.state.streak });
    this._unlock('daily');
    if (this.state.streak >= 3) this._unlock('streak3');
  }

  _unlock(id) {
    if (this.state.achievements[id]) return;
    this.state.achievements[id] = this.today();
    this.onUnlock('achievement', ACHIEVEMENTS.find((a) => a.id === id));
  }

  /** Add a finished game to the table. Returns its place (1 = best) or 0 when it did not make the top 10. */
  recordScore(score, chapter) {
    if (!(score > 0)) return 0;
    const entry = { score, chapter, day: this.today() };
    const list = [...this.state.scores, entry].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
    this.state.scores = list;
    this._save();
    const i = list.indexOf(entry);
    return i < 0 ? 0 : i + 1;
  }
}
