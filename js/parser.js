// Hebrew natural-language parser for events + sub-tasks.
// "אימון בשעה 17:00 ולאחר מכן לקנות חלב ופירות"
//   → event "אימון" today 17:00, tasks ["לקנות חלב", "לקנות פירות"]

const HE = '\\u0590-\\u05FF';
const B = `(^|[\\s,(])`; // left boundary (captured)
const E = `(?=$|[\\s,.!?)])`; // right boundary

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const WEEKDAYS = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
const WEEKDAY_LETTERS = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 };
const NUM_WORDS = {
  'אחת עשרה': 11, 'אחד עשרה': 11, 'שתים עשרה': 12, 'שתיים עשרה': 12,
  'אחת': 1, 'שתיים': 2, 'שתים': 2, 'שלוש': 3, 'ארבע': 4, 'חמש': 5, 'שש': 6,
  'שבע': 7, 'שמונה': 8, 'תשע': 9, 'עשר': 10,
};
const MINUTE_WORDS = { 'וחצי': 30, 'ורבע': 15, 'ועשרים': 20, 'ועשרה': 10, 'וחמישה': 5, 'וארבעים': 40 };
const DAYPART = `(בבוקר|בצהריים|בצהרים|אחה"צ|אחה״צ|אחר הצהריים|אחרי הצהריים|בערב|בלילה)`;

const CONNECTOR = /\s*,?\s*(?:ו?לאחר מכן|ו?אחר כך|ו?אחרי זה|ו?אח"כ|ו?אח״כ)\s*,?\s*/;

const NOT_VERBS = new Set(['לחם', 'לחמניות', 'לימון', 'לימונים', 'לבנה', 'לבן', 'לוח', 'לפטופ', 'לביבות', 'לקוח', 'לקוחות', 'ליים']);

export function isInfinitive(word) {
  const w = (word || '').replace(/^ו/, '');
  return /^ל[֐-׿]{3,}$/.test(w) && !NOT_VERBS.has(w);
}

const HEB_MONTHS = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
const NOT_TIME_AFTER = `(?!\\s*(?:ימים|יום|שבועות|חודשים|דקות|שעות|ש"ח|ש״ח|₪|%|לחודש|ב(?:${Object.keys(HEB_MONTHS).join('|')})))`;

function applyDaypart(h, part, explicitColon) {
  if (part) {
    if (part === 'בבוקר') return h === 12 ? 0 : h;
    if (part === 'בלילה') return h >= 6 && h < 12 ? h + 12 : h === 12 ? 0 : h;
    if (part.startsWith('בצהר')) return h < 6 ? h + 12 : h;
    return h < 12 ? h + 12 : h; // ערב / אחה"צ
  }
  if (explicitColon === 'zero') return h; // "06:00" written with a leading zero – keep as is
  if (h >= 1 && h <= 6) return h + 12; // "בחמש", "ב-5", "5:00" → afternoon
  return h;
}

/** Remove a regex match from the working string, preserving the captured left boundary. */
function cut(state, re, handler) {
  const m = state.s.match(re);
  if (!m) return false;
  const ok = handler(m);
  if (ok === false) return false;
  const lead = m[1] && /^[\s,(]$/.test(m[1]) ? m[1] : '';
  state.s = state.s.slice(0, m.index) + lead + ' ' + state.s.slice(m.index + m[0].length);
  return true;
}

function extractDate(state, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = null;

  // DD/MM(/YYYY) or DD.MM(.YYYY)
  cut(state, new RegExp(`${B}(?:ב?יום\\s+[${HE}'׳]+\\s+|ב[-־]?|ב?תאריך\\s+)?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?${E}`), (m) => {
    const d = +m[2], mo = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    let y = m[4] ? +m[4] : today.getFullYear();
    if (y < 100) y += 2000;
    let dt = new Date(y, mo - 1, d);
    if (!m[4] && dt < addDays(today, -1)) dt = new Date(y + 1, mo - 1, d);
    date = dt;
    // also drop a weekday name right before / after (e.g. "ביום שלישי 25/11")
    return true;
  });

  // "ב-25 בנובמבר", "25 לנובמבר"
  if (!date) cut(state, new RegExp(`${B}(?:ב|ה)?[-־]?(\\d{1,2})\\s+(?:ב|ל)(${Object.keys(HEB_MONTHS).join('|')})(?:\\s+(\\d{4}))?${E}`), (m) => {
    const d = +m[2], mo = HEB_MONTHS[m[3]];
    if (d < 1 || d > 31) return false;
    let y = m[4] ? +m[4] : today.getFullYear();
    let dt = new Date(y, mo - 1, d);
    if (!m[4] && dt < addDays(today, -1)) dt = new Date(y + 1, mo - 1, d);
    date = dt;
    return true;
  });
  // "ה-25 לחודש"
  if (!date) cut(state, new RegExp(`${B}(?:ב|ה)?[-־]?(\\d{1,2})\\s+לחודש(?:\\s+הבא)?${E}`), (m) => {
    const d = +m[2];
    if (d < 1 || d > 31) return false;
    let dt = new Date(today.getFullYear(), today.getMonth(), d);
    if (dt < today || m[0].includes('הבא')) dt = new Date(today.getFullYear(), today.getMonth() + 1, d);
    date = dt;
    return true;
  });

  const weekdayRes = [
    new RegExp(`${B}(?:ב?יום\\s+)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(\\s+הבא|\\s+הקרוב)?${E}`),
    new RegExp(`${B}ב(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(\\s+הבא|\\s+הקרוב)?${E}`),
    new RegExp(`${B}(?:ב?יום\\s+)([אבגדהוש])['׳](\\s+הבא|\\s+הקרוב)?${E}`),
  ];
  for (const re of weekdayRes) {
    const found = cut(state, re, (m) => {
      if (date) return true; // explicit date wins, just strip the weekday
      const wd = WEEKDAYS[m[2]] ?? WEEKDAY_LETTERS[m[2]];
      if (wd === undefined) return false;
      let diff = (wd - today.getDay() + 7) % 7;
      if (m[3] && m[3].includes('הבא') && diff === 0) diff = 7;
      date = addDays(today, diff);
      return true;
    });
    if (found) break;
  }

  if (!date) {
    const rel = [
      [/(^|[\s,(])מחרתיים(?=$|[\s,.!?)])/, 2],
      [/(^|[\s,(])(?:ב)?מחר(?=$|[\s,.!?)])/, 1],
      [/(^|[\s,(])היום(?=$|[\s,.!?)])/, 0],
      [/(^|[\s,(])(?:בעוד\s+)?שבוע\s+הבא(?=$|[\s,.!?)])/, 7],
    ];
    for (const [re, n] of rel) {
      if (cut(state, re, () => { date = addDays(today, n); return true; })) break;
    }
    // "בעוד 3 ימים"
    if (!date) cut(state, /(^|[\s,(])בעוד\s+(\d{1,2})\s+ימים(?=$|[\s,.!?)])/, (m) => { date = addDays(today, +m[2]); return true; });
  }
  return date ? ymd(date) : null;
}

function extractTime(state) {
  let time = null;
  const set = (h, mi) => {
    if (h > 23 || mi > 59) return false;
    time = `${pad(h)}:${pad(mi)}`;
    return true;
  };
  const dpRe = `(?:\\s+${DAYPART})?`;

  // HH:MM / HH.MM
  if (cut(state, new RegExp(`${B}(?:ב?שעה\\s*|ב[-־]?\\s?)?(\\d{1,2})[:.](\\d{2})${dpRe}${E}`), (m) => set(applyDaypart(+m[2], m[4], m[2].length === 2 && m[2][0] === '0' ? 'zero' : true), +m[3]))) return time;

  // "בשעה 5", "ב-17", "ב5 בערב"
  if (cut(state, new RegExp(`${B}(?:ב?שעה\\s*)(\\d{1,2})(\\s+וחצי|\\s+ורבע)?${dpRe}${E}`), (m) => set(applyDaypart(+m[2], m[4], +m[2] > 12), MINUTE_WORDS[(m[3] || '').trim()] || 0))) return time;
  if (cut(state, new RegExp(`${B}ב[-־]?\\s?(\\d{1,2})(\\s+וחצי|\\s+ורבע)?\\s+${DAYPART}${E}`), (m) => set(applyDaypart(+m[2], m[4], false), MINUTE_WORDS[(m[3] || '').trim()] || 0))) return time;
  // bare "ב-5" / "ב5" / "ב 5" (common in iPhone dictation)
  if (cut(state, new RegExp(`${B}ב[-־]?\\s?(\\d{1,2})(\\s+וחצי|\\s+ורבע)?${NOT_TIME_AFTER}${E}`), (m) => +m[2] >= 1 && +m[2] <= 23 && set(applyDaypart(+m[2], null, false), MINUTE_WORDS[(m[3] || '').trim()] || 0))) return time;

  // Number words: "בחמש", "בשעה שמונה וחצי בערב"
  const words = Object.keys(NUM_WORDS).join('|');
  const mins = Object.keys(MINUTE_WORDS).join('|');
  cut(state, new RegExp(`${B}(?:ב?שעה\\s+|ב)(${words})(?:\\s+(${mins}))?${dpRe}${E}`), (m) => set(applyDaypart(NUM_WORDS[m[2]], m[4], false), MINUTE_WORDS[m[3]] || 0));
  return time;
}

function cleanTitle(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  // dangling prepositions left after removing date/time tokens
  for (let i = 0; i < 3; i++) {
    t = t.replace(/(^|\s)(בשעה|שעה|ביום|יום|ב|ב-|ל|ב־|ה)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[,.\-–:]+|[,.\-–:]+$/g, '').trim();
    t = t.replace(/^ו(?=[֐-׿]{3,})/, '');
  }
  return t;
}

/** Split "לקנות חלב ופירות, להתקשר לאמא" into tasks, inheriting the verb. */
export function splitTasks(text) {
  if (!text) return [];
  const parts = text
    .split(/\s*[,;]\s*|\s+וגם\s+|\s+(?=ו[֐-׿]{2,})/)
    .map((p) => p.trim().replace(/^ו(?=[֐-׿]{2,})/, '').replace(/^גם\s+/, '').trim())
    .filter(Boolean);
  const out = [];
  let verb = null;
  for (const p of parts) {
    const first = p.split(/\s+/)[0];
    if (isInfinitive(first)) {
      verb = first;
      out.push(p);
    } else if (verb) {
      out.push(`${verb} ${p}`);
    } else {
      out.push(p);
    }
  }
  return out.map((t) => t.replace(/[.!?]+$/, '').trim()).filter(Boolean);
}

/**
 * Parse free text.
 * @returns {{kind:'event'|'task', title:string, date:string|null, time:string|null, tasks:string[], raw:string}}
 */
export function parseInput(raw, now = new Date()) {
  const text = (raw || '').replace(/[‏‎]/g, '').replace(/\s+/g, ' ').trim();
  const res = { kind: 'task', title: '', date: null, time: null, tasks: [], raw: text };
  if (!text) return res;

  const conn = text.match(CONNECTOR);
  let eventPart = text, taskPart = '';
  if (conn) {
    eventPart = text.slice(0, conn.index);
    taskPart = text.slice(conn.index + conn[0].length);
  }

  const state = { s: ` ${eventPart} ` };
  res.date = extractDate(state, now);
  res.time = extractTime(state);
  // a date may appear after the time ("בשעה 5 מחר")
  if (!res.date) res.date = extractDate(state, now);
  res.title = cleanTitle(state.s);
  res.tasks = splitTasks(taskPart);

  const firstWord = res.title.split(' ')[0];
  if (res.time || res.tasks.length) res.kind = 'event';
  else if (res.date && !isInfinitive(firstWord)) res.kind = 'event';
  else res.kind = 'task';

  if (res.kind === 'event' && !res.date) res.date = ymd(now);
  if (!res.title && res.kind === 'event') res.title = 'אירוע';
  return res;
}
