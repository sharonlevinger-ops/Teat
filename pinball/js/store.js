// Local-first storage (localStorage): player profiles, per-player records & history,
// daily challenge, settings and the auto-saved game. Every access is guarded: private mode
// or blocked storage simply falls back to defaults.

const K = {
  profiles: 'fcp_profiles_v1',
  best: (id) => `fcp_best_v1:${id}`,
  legacyBest: 'fcp_best_v1',
  history: (id) => `fcp_hist_v1:${id}`,
  daily: (id) => `fcp_daily_v1:${id}`,
  settings: 'fcp_settings_v1',
  save: 'fcp_save_v1',
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

// ------------------------------------------------------------------ profiles
export function loadProfiles() {
  let p = read(K.profiles, null);
  if (!p || !Array.isArray(p.list) || !p.list.length) {
    p = { list: [{ id: 'sharon', name: 'שרון' }], selected: ['sharon'] };
    // first run after this update: the old single record belongs to Sharon
    const legacy = read(K.legacyBest, null);
    if (legacy && !read(K.best('sharon'), null)) write(K.best('sharon'), legacy);
    write(K.profiles, p);
  }
  if (!Array.isArray(p.selected) || !p.selected.length) p.selected = [p.list[0].id];
  p.selected = p.selected.filter((id) => p.list.some((x) => x.id === id));
  if (!p.selected.length) p.selected = [p.list[0].id];
  return p;
}
export function saveProfiles(p) { write(K.profiles, p); }
export function addProfile(p, name) {
  const clean = String(name || '').trim().slice(0, 14);
  if (!clean || p.list.length >= 8 || p.list.some((x) => x.name === clean)) return null;
  const id = 'p' + Date.now().toString(36);
  p.list.push({ id, name: clean });
  saveProfiles(p);
  return id;
}
export function removeProfile(p, id) {
  if (p.list.length <= 1) return false;
  p.list = p.list.filter((x) => x.id !== id);
  p.selected = p.selected.filter((x) => x !== id);
  if (!p.selected.length) p.selected = [p.list[0].id];
  saveProfiles(p);
  remove(K.best(id)); remove(K.history(id)); remove(K.daily(id));
  return true;
}
export const profileName = (p, id) => (p.list.find((x) => x.id === id) || {}).name || '';

// ------------------------------------------------------------------ records
export function loadBest(id) {
  return { score: 0, combo: 0, games: 0, achievements: [], ...read(K.best(id), {}) };
}
export function saveBest(id, best) { write(K.best(id), best); }

// ------------------------------------------------------------------ history (last 50 games)
export function loadHistory(id) { const h = read(K.history(id), []); return Array.isArray(h) ? h : []; }
export function pushHistory(id, rec) {
  const h = loadHistory(id); h.push(rec);
  while (h.length > 50) h.shift();
  write(K.history(id), h);
  return h;
}
export function historySummary(h) {
  if (!h.length) return null;
  const last = h.slice(-10);
  const avg = last.reduce((s, r) => s + r.score, 0) / last.length;
  const prev = h.slice(-20, -10);
  const prevAvg = prev.length ? prev.reduce((s, r) => s + r.score, 0) / prev.length : null;
  return { games: h.length, avg, trend: prevAvg ? (avg - prevAvg) / Math.max(1, prevAvg) : null, recent: h.slice(-5).map((r) => r.score) };
}

// ------------------------------------------------------------------ daily challenge
export const CHALLENGES = [
  { id: 'crystal3', text: '3 רמפות קריסטל במשחק אחד', done: (s) => s.shots.crystal >= 3 },
  { id: 'wizard', text: 'להפעיל את מולטיבול המכשף', done: (s) => s.flags.wizard },
  { id: 'score500', text: 'לצבור 500,000 נקודות', done: (s) => s.score >= 500000 },
  { id: 'orbit4', text: '4 הקפות יער במשחק אחד', done: (s) => s.shots.orbit >= 4 },
  { id: 'treasure', text: 'לאסוף את מטמון הגמדים', done: (s) => s.flags.treasure },
  { id: 'mage2', text: 'להשלים M-A-G-E פעמיים', done: (s) => s.mageDone >= 2 },
  { id: 'combo4', text: 'קומבו x4', done: (s) => s.bestCombo >= 4 },
  { id: 'gate', text: 'לפתוח את שער הטירה', done: (s) => s.flags.gate },
  { id: 'tower3', text: '3 רמפות מגדל במשחק אחד', done: (s) => s.shots.towerRamp >= 3 },
];
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function todayChallenge(d = new Date()) {
  const day = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  return CHALLENGES[((day % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
}
export function loadDaily(id) { return { streak: 0, last: null, done: {}, ...read(K.daily(id), {}) }; }
export function completeDaily(id, d = new Date()) {
  const s = loadDaily(id);
  const today = dayKey(d);
  if (s.done[today]) return { ...s, already: true };
  const y = new Date(d); y.setDate(y.getDate() - 1);
  s.streak = s.last === dayKey(y) ? s.streak + 1 : 1;
  s.last = today; s.done[today] = true;
  const keys = Object.keys(s.done).sort(); while (keys.length > 60) delete s.done[keys.shift()];
  write(K.daily(id), s);
  return s;
}
export function dailyStatus(id, d = new Date()) {
  const s = loadDaily(id);
  const y = new Date(d); y.setDate(y.getDate() - 1);
  const alive = s.last === dayKey(d) || s.last === dayKey(y);
  return { doneToday: !!s.done[dayKey(d)], streak: alive ? s.streak : 0 };
}

// ------------------------------------------------------------------ settings
export const DEFAULT_SETTINGS = { difficulty: 'easy', ballSave: 15, balls: 3, speed: 1, controls: 'halves', glow: true, battery: false };
export function loadSettings() { return { ...DEFAULT_SETTINGS, ...read(K.settings, {}) }; }
export function saveSettings(s) { write(K.settings, s); }

// ------------------------------------------------------------------ auto-saved game
export function loadSave() { const s = read(K.save, null); return s && s.v === 1 ? s : null; }
export function writeSave(s) { return write(K.save, s); }
export function clearSave() { remove(K.save); }
