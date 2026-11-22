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
  // the table features
  { id: 'scoop3', text: 'Sink 3 balls in the mystery hole', ev: 'scoopCapture', n: 3 },
  { id: 'pool1', text: 'Collect a Pool Jackpot', ev: 'poolJackpot', n: 1 },
  { id: 'mage2', text: 'Complete M-A-G-E twice', ev: 'lanesComplete', n: 2 },
  { id: 'bonusX3', text: 'Reach bonus X3', ev: 'bonusX', test: (p) => p.x >= 3, n: 1 },
  { id: 'crystalJP', text: 'Collect a Crystal Jackpot', ev: 'crystalJackpot', n: 1, tables: ['forest'] },
  { id: 'orbit1', text: 'Make a Double Orbit', ev: 'doubleOrbit', n: 1 },
  { id: 'frenzy1', text: 'Start a Spore Frenzy', ev: 'frenzyStart', n: 1 },
  { id: 'chapterM2', text: 'Finish 2 chapter missions', ev: 'chapterMission', n: 2 },
  { id: 'extra1', text: 'Win an Extra Ball', ev: 'extraBall', n: 1 },
  // Forest Kingdom only
  { id: 'rescue1', text: 'Rescue the princess', ev: 'princessRescued', n: 1, tables: ['kingdom'] },
  { id: 'gems1', text: 'Collect a gem jackpot in the mine', ev: 'gemJackpot', n: 1, tables: ['kingdom'] },
  { id: 'quest1', text: "Complete the prince's quest", ev: 'questEnd', test: (p) => p.collected, n: 1, tables: ['kingdom'] },
  { id: 'spin20', text: 'Spin the fairy spinner 20 times', ev: 'spin', n: 20, tables: ['kingdom'] },
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

/** Table stars: five milestones that stay with the table (like the star ratings of real pinball apps). */
export const STARS = [
  { id: 'score50k', text: 'Score 50,000 in one game', ev: 'score', test: (p) => p.total >= 50000 },
  { id: 'multiball', text: "Start the wizard's multiball", ev: 'multiballStart' },
  { id: 'chapter3', text: "Reach chapter 3: Dragon's Gate", ev: 'stage', test: (p) => !p.initial && p.index >= 2 },
  { id: 'dragonFire', text: "Light Dragon's Fire", ev: 'dragonStart' },
  { id: 'slayer', text: 'Defeat the dragon', ev: 'dragonEnd', test: (p) => p.completed && p.victory },
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
export function dailyMissions(key, table = 'forest') {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const pool = MISSION_POOL.filter((m) => !m.tables || m.tables.includes(table)).map((m) => m.id);
  const out = [];
  while (out.length < 3) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const id = pool.splice(h % pool.length, 1)[0];
    out.push(id);
  }
  return out;
}

export class Progress {
  constructor(storage, today = () => dayKey(), { key = KEY, table = 'forest' } = {}) {
    this.storage = storage;
    this.today = today;
    this.key = key; // each table keeps its own journal
    this.table = table;
    this.onUnlock = () => {}; // (kind: 'mission' | 'daily' | 'achievement', item) – the UI shows a banner
    const s = storage.get(this.key, null);
    this.state = {
      day: '', missions: [], streak: 0, lastFullDay: '', achievements: {}, scores: [], stars: {},
      ...(s && typeof s === 'object' ? s : {}),
    };
    // never trust what comes back from storage: keep only well-formed entries
    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    this.state.scores = (Array.isArray(this.state.scores) ? this.state.scores : [])
      .filter((r) => r && num(r.score) > 0)
      .map((r) => ({ score: Math.round(num(r.score)), chapter: Math.min(3, Math.max(1, Math.round(num(r.chapter, 1)))), day: /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : '' }))
      .sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
    if (!this.state.achievements || typeof this.state.achievements !== 'object' || Array.isArray(this.state.achievements)) this.state.achievements = {};
    for (const k of Object.keys(this.state.achievements)) if (!ACHIEVEMENTS.some((a) => a.id === k)) delete this.state.achievements[k];
    this.state.streak = Math.max(0, Math.round(num(this.state.streak)));
    this.state.bestChapter = Math.min(3, Math.max(1, Math.round(num(this.state.bestChapter, 1))));
    const v = this.state.chapterVisits;
    this.state.chapterVisits = [1, 2, 3].map((i) => Math.max(0, Math.round(num(Array.isArray(v) ? v[i - 1] : 0))));
    if (!this.state.stars || typeof this.state.stars !== 'object' || Array.isArray(this.state.stars)) this.state.stars = {};
    for (const k of Object.keys(this.state.stars)) if (!STARS.some((x) => x.id === k)) delete this.state.stars[k];
    const okMissions = Array.isArray(this.state.missions) && this.state.missions.length === 3
      && this.state.missions.every((m) => m && MISSION_POOL.some((x) => x.id === m.id) && Number.isFinite(m.count));
    if (!okMissions) { this.state.missions = []; this.state.day = ''; }
    this._checkDay();
  }

  _save() { this.storage.set(this.key, this.state); }

  /** New day: three new missions (yesterday's progress does not carry over). */
  _checkDay() {
    const key = this.today();
    if (this.state.day === key && Array.isArray(this.state.missions) && this.state.missions.length === 3) return;
    this.state.day = key;
    this.state.missions = dailyMissions(key, this.table).map((id) => ({ id, count: 0, done: false }));
    if (this.state.lastFullDay && this.state.lastFullDay !== prevDay(key) && this.state.lastFullDay !== key) this.state.streak = 0;
    this._save();
  }

  get missions() {
    this._checkDay();
    return this.state.missions.map((m) => ({ ...MISSION_POOL.find((p) => p.id === m.id), count: m.count, done: m.done }));
  }

  get streak() { return this.state.streak; }
  /** furthest chapter ever reached (1–3) and how many games reached each chapter */
  get bestChapter() { return this.state.bestChapter; }
  get starCount() { return STARS.filter((x) => this.state.stars[x.id]).length; }
  hasStar(id) { return !!this.state.stars[id]; }
  get chapterVisits() { return this.state.chapterVisits; }
  get scores() { return this.state.scores; }
  hasAchievement(id) { return !!this.state.achievements[id]; }

  bind(bus) {
    bus.on('*', (type, p) => { if (type !== 'contact' && type !== 'flipper') this.onEvent(type, p || {}); });
  }

  onEvent(type, p) {
    let changed = false;
    if (type === 'gameStart') { this._checkDay(); this.state.chapterVisits[0]++; changed = true; }
    if (type === 'stage' && !p.initial && p.index >= 1 && p.index <= 2) {
      this.state.chapterVisits[p.index]++;
      if (p.index + 1 > this.state.bestChapter) { this.state.bestChapter = p.index + 1; this.onUnlock('chapter', { chapter: p.index + 1 }); }
      changed = true;
    }
    for (const m of this.state.missions) {
      if (m.done) continue;
      const def = MISSION_POOL.find((x) => x.id === m.id);
      if (!def || def.ev !== type || (def.test && !def.test(p))) continue;
      m.count = Math.min(def.n, m.count + 1);
      changed = true;
      if (m.count >= def.n) { m.done = true; this.onUnlock('mission', def); }
    }
    if (changed && this.state.missions.every((m) => m.done)) this._dayComplete();
    for (const st of STARS) {
      if (st.ev === type && !this.state.stars[st.id] && (!st.test || st.test(p))) {
        this.state.stars[st.id] = this.today();
        changed = true;
        this.onUnlock('star', { ...st, count: this.starCount, of: STARS.length });
      }
    }
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

/** What happened in one game (for the end-of-game summary). */
export class GameStats {
  constructor(bus) {
    this.reset();
    bus.on('gameStart', () => this.reset());
    bus.on('wizardHit', () => this.wizard++);
    bus.on('towerEnter', () => this.tower++);
    bus.on('superJackpot', () => this.jackpots++);
    bus.on('ramp', () => this.ramps++);
    bus.on('loop', () => this.ramps++);
    bus.on('skillShot', () => this.skill++);
    bus.on('rushStart', () => this.rush++);
    bus.on('comboChain', ({ level }) => { this.bestCombo = Math.max(this.bestCombo, level); });
    bus.on('stage', ({ index }) => { this.chapter = Math.max(this.chapter, index + 1); });
  }

  reset() { Object.assign(this, { wizard: 0, tower: 0, jackpots: 0, ramps: 0, skill: 0, rush: 0, bestCombo: 0, chapter: 1 }); }
}
