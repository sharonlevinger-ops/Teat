const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');

const fixed = [
  ...DATA.levels.flatMap((l) => l.exercises),
  ...DATA.penta.sections.flatMap((x) => x.exercises),
  ...DATA.chords.sections.flatMap((x) => x.exercises),
];
const all = fixed.filter((e) => e.mode !== 'chords'); // תרגילי תווים (בלי אקורדים)
const chordEx = fixed.filter((e) => e.mode === 'chords');
const OPEN_PC = { 6: 4, 5: 9, 4: 2, 3: 7, 2: 11, 1: 4 };
const pc = (s, f) => (OPEN_PC[s] + f) % 12;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A = 9;
const SET = {
  minorPent: [0, 3, 5, 7, 10], majorPent: [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10], major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11], phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
};
const pcs = (k) => new Set(SET[k].map((i) => (A + i) % 12));
const ex = (id) => all.find((e) => e.id === id);

test('ארבע רמות, ושמה של הראשונה הוא חימום אצבעות', () => {
  assert.equal(DATA.levels.length, 4);
  assert.match(DATA.levels[0].name, /חימום אצבעות/);
  for (const l of DATA.levels) assert.ok(l.exercises.length >= 6, `רמה ${l.id}`);
});

test('שבע לשוניות: שלבים 1-4, פנטטוני, אקורדים ואלתור', () => {
  assert.deepEqual(DATA.tabs.map((t) => t.id), ['l1', 'l2', 'l3', 'l4', 'penta', 'chords', 'improv']);
});

test('רמה 3 כוללת טכניקות חדשות (ליגטו, סלייד, ויברטו) ובלי סולמות פנטטוניים', () => {
  const ids = DATA.levels[2].exercises.map((e) => e.id);
  for (const id of ['legato', 'slide', 'vibrato', 'bend']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((id) => id.startsWith('pm-') || id === 'blues-1' || id === 'bb-box'));
});

test('הבסיס למתחילים הוסר: אין מדריך, מיתרים פתוחים או אצבע-אחת', () => {
  for (const id of ['guide', 'open', 'f1', 'f2', 'f3', 'f4']) assert.equal(ex(id), undefined, id);
});

test('מזהי תרגילים ייחודיים', () => {
  assert.equal(new Set(fixed.map((e) => e.id)).size, fixed.length);
});

test('כל תו תקין: מיתר 1-6, סריג בחלון הלוח, אצבע 0-4 (פתוח = בלי אצבע)', () => {
  for (const e of all) {
    assert.ok(e.steps.length >= 2, e.id);
    const start = e.startFret || 1;
    for (const st of e.steps) {
      assert.ok(st.s >= 1 && st.s <= 6, `${e.id} מיתר ${st.s}`);
      assert.ok(st.f === 0 || (st.f >= start && st.f <= start + e.frets - 1), `${e.id} סריג ${st.f} מחוץ לחלון ${start}-${start + e.frets - 1}`);
      assert.ok(st.fi >= 0 && st.fi <= 4, `${e.id} אצבע ${st.fi}`);
      assert.equal(st.f === 0, st.fi === 0, `${e.id}: מיתר פתוח = בלי אצבע`);
    }
  }
});

test('בתנוחה הראשונה (בלי חלון מוזז) האצבע שווה לסריג', () => {
  for (const e of all.filter((x) => !x.startFret && !x.dynamicFingers)) for (const st of e.steps) assert.equal(st.fi, st.f, e.id);
});

test('מטפס כרומטי: כל קבוצה 1-2-3-4 על ארבעה סריגים רצופים, וזזה סריג אחד', () => {
  const e = ex('chrom-climb');
  assert.equal(e.steps.length, 36);
  for (let g = 0; g < 9; g++) {
    for (let k = 0; k < 4; k++) {
      const st = e.steps[g * 4 + k];
      assert.deepEqual([st.f, st.fi], [g + 1 + k, k + 1]);
    }
  }
  assert.equal(e.frets, 12);
});

test('פדל פתוח: מיתר פתוח לסירוגין עם סריג 1 עד 4', () => {
  const e = ex('open-pedal');
  assert.deepEqual(e.steps.map((x) => x.f), [0, 1, 0, 2, 0, 3, 0, 4]);
});

test('ספיידר: מכסה את כל המיתרים והסריגים, בלי תו כפול ברצף', () => {
  for (const id of ['1-2', '2-1', '2-2', 'sp-up', 'spider-rev']) {
    const e = ex(id);
    assert.equal(new Set(e.steps.map((x) => `${x.s}-${x.f}`)).size, 24, id);
    for (let i = 0; i < e.steps.length; i++) {
      const a = e.steps[i], b = e.steps[(i + 1) % e.steps.length];
      assert.ok(!(a.s === b.s && a.f === b.f), `${id} חזרה ברצף בצעד ${i}`);
    }
  }
  assert.equal(ex('1-2').steps.length, 46);
  assert.deepEqual(ex('spider-rev').steps.slice(0, 4).map((x) => x.fi), [4, 3, 2, 1]);
});

test('Hammer-on/Pull-off: כל קבוצה מתחילה בפריטה, ואחריה h ואז p באותו מיתר', () => {
  for (const id of ['2-3', '2-4']) {
    const e = ex(id);
    assert.equal(e.steps.length % 3, 0, id);
    for (let i = 0; i < e.steps.length; i += 3) {
      const [a, b, c] = e.steps.slice(i, i + 3);
      assert.equal(a.t, undefined);
      assert.equal(b.t, 'h');
      assert.equal(c.t, 'p');
      assert.ok(a.s === b.s && b.s === c.s);
      assert.ok(b.f > a.f && c.f === a.f);
    }
  }
});

test('בנד: אותו סריג לבנד ולשחרור, עם אצבע 3', () => {
  const e = ex('bend');
  assert.deepEqual(e.steps.map((x) => x.t), [undefined, undefined, 'b', 'r']);
  assert.ok(e.steps.slice(1).every((x) => x.s === 1 && x.f === 10 && x.fi === 3));
});

test('חמש תנוחות פנטטוני מינורי: כל התווים בסולם, שני תווים סמוכים בסולם בכל מיתר, והכלל של אצבעות', () => {
  const set = pcs('minorPent');
  for (const id of ['pm-1', 'pm-2', 'pm-3', 'pm-4', 'pm-5']) {
    const e = ex(id);
    const up = e.steps.slice(0, 12);
    for (let i = 0; i < 6; i++) {
      const s = 6 - i;
      const [a, b] = [up[i * 2], up[i * 2 + 1]];
      assert.ok(a.s === s && b.s === s, id);
      assert.ok(set.has(pc(s, a.f)) && set.has(pc(s, b.f)), `${id} מיתר ${s} תו מחוץ לסולם`);
      // אין תו סולם בין שני התווים
      for (let f = a.f + 1; f < b.f; f++) assert.ok(!set.has(pc(s, f)), `${id} מיתר ${s}: דילוג על תו`);
      assert.equal(a.fi, 1, id);
      assert.equal(b.fi, b.f - a.f + 1, id);
    }
  }
});

test('תנוחות הפנטטוני מתחברות: התו הגבוה של תנוחה הוא התו הנמוך של התנוחה הבאה', () => {
  const order = ['pm-5', 'pm-1', 'pm-2', 'pm-3', 'pm-4'];
  for (let i = 0; i < 4; i++) {
    const cur = ex(order[i]).steps.slice(0, 12);
    const next = ex(order[i + 1]).steps.slice(0, 12);
    for (let s = 0; s < 6; s++) assert.equal(cur[s * 2 + 1].f, next[s * 2].f, `${order[i]} -> ${order[i + 1]} מיתר ${6 - s}`);
  }
});

test('תבנית B.B.: פנטטוני מז׳ורי בלה (A B C# E F#)', () => {
  const set = pcs('majorPent');
  const e = ex('bb-box');
  for (const st of e.steps) assert.ok(set.has(pc(st.s, st.f)), `${st.s}-${st.f}`);
  assert.equal(pc(2, 10), A); // השורש לה במיתר 2 סריג 10
});

test('סולמות: כל התווים שייכים לסולם, לפחות שני תווים בכל מיתר, אצבע לכל סריג, ושני תנוחות לכל סולם', () => {
  const sets = {
    'major-1': 'major', 'major-2': 'major', 'minor-1': 'naturalMinor', 'minor-2': 'naturalMinor',
    'mixo-1': 'mixolydian', 'mixo-2': 'mixolydian', 'dorian-1': 'dorian', 'dorian-2': 'dorian',
    'harm-1': 'harmonicMinor', 'harm-2': 'harmonicMinor', 'phryg-1': 'phrygianDominant', 'phryg-2': 'phrygianDominant',
  };
  for (const [id, key] of Object.entries(sets)) {
    const e = ex(id);
    const set = pcs(key);
    const base = e.startFret;
    const perString = {};
    for (const st of e.steps) {
      assert.ok(set.has(pc(st.s, st.f)), `${id}: ${NAMES[pc(st.s, st.f)]} מחוץ לסולם`);
      assert.equal(st.fi, st.f - base + 1, id);
      (perString[st.s] ||= new Set()).add(st.f);
    }
    for (let s = 1; s <= 6; s++) assert.ok(perString[s].size >= 2, `${id} מיתר ${s}`);
    // כל תו סולם בחלון מופיע (אין תו שהושמט)
    for (let s = 1; s <= 6; s++) for (let f = base; f < base + 4; f++) if (set.has(pc(s, f))) assert.ok(perString[s].has(f), `${id} חסר ${s}-${f}`);
  }
});

test('סולם בלוז: מכיל את תו המתח (b5 = מי במול) ומסמן אותו', () => {
  const e = ex('blues-1');
  const blue = e.steps.filter((x) => x.blue);
  assert.ok(blue.length > 0);
  for (const st of blue) assert.equal(pc(st.s, st.f), (A + 6) % 12);
  assert.equal(new Set(blue.map((x) => `${x.s}-${x.f}`)).size, 2); // מיתר 5 סריג 6, מיתר 3 סריג 8
  for (const st of e.steps) assert.ok(pcs('blues').has(pc(st.s, st.f)));
});

test('סולם דו מז׳ור פתוח: C D E F G A B C', () => {
  const e = ex('scale-c');
  const up = e.steps.slice(0, 8).map((x) => NAMES[pc(x.s, x.f)]);
  assert.deepEqual(up, ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
});

test('פנטטוני בשלשות: 30 תווים בקבוצות של שלושה שזזות תו אחד', () => {
  const e = ex('seq3');
  assert.equal(e.steps.length, 30);
  const up = ex('pm-1').steps.slice(0, 12);
  for (let g = 0; g < 10; g++) for (let k = 0; k < 3; k++) assert.deepEqual(e.steps[g * 3 + k], up[g + k]);
});

test('מהירות עולה: הגדרות סבירות', () => {
  for (const e of all.filter((x) => x.ramp)) {
    assert.ok(e.ramp.max > e.startBpm && e.ramp.max <= 160, e.id);
    assert.ok(e.ramp.step >= 1 && e.ramp.step <= 10, e.id);
  }
});

test('תרגילים "בסגנון" מסומנים בבירור כך, בלי להתיימר שהם של הנגן', () => {
  const styled = all.filter((e) => e.style && /Slash|Joe Perry/.test(e.style.title));
  assert.ok(styled.length >= 2);
  for (const e of styled) {
    assert.match(e.style.title, /בסגנון/);
    assert.match(e.style.note, /לא ציטוט/);
  }
});

test('כל תרגיל כולל הוראות, מטרה וקצב התחלתי סביר', () => {
  for (const e of all) {
    assert.ok(e.howTo.length >= 2 && e.goal && e.title, e.id);
    assert.ok(e.startBpm >= 30 && e.startBpm <= 80, e.id);
  }
});

// ---------- לשונית פנטטוני ----------
test('לשונית פנטטוני: מהקל לקשה בתוך כל קבוצה, וכל תרגיל מסומן ברמת קושי', () => {
  const rank = { קל: 1, בינוני: 2, קשה: 3 };
  for (const sec of DATA.penta.sections) {
    let prev = 0;
    for (const e of sec.exercises) {
      assert.ok(rank[e.diff], `${e.id} בלי רמת קושי`);
      assert.ok(rank[e.diff] >= prev, `${sec.title}: ${e.id} לא בסדר עולה`);
      prev = rank[e.diff];
    }
  }
  assert.ok(DATA.penta.sections.flatMap((s) => s.exercises).length >= 14);
});

test('פנטטוני מז׳ורי: חמש תנוחות, כולן בסולם לה מז׳ורי פנטטוני, ותנוחה 4 היא תבנית B.B.', () => {
  const set = pcs('majorPent');
  for (const id of ['pmaj-1', 'pmaj-2', 'pmaj-3', 'bb-box', 'pmaj-5']) {
    const e = ex(id);
    const up = e.steps.slice(0, 12);
    for (let i = 0; i < 6; i++) {
      const s = 6 - i;
      const [a, b] = [up[i * 2], up[i * 2 + 1]];
      assert.ok(set.has(pc(s, a.f)) && set.has(pc(s, b.f)), `${id} מיתר ${s}`);
      for (let f = a.f + 1; f < b.f; f++) assert.ok(!set.has(pc(s, f)), `${id} דילוג על תו`);
    }
  }
  assert.deepEqual(ex('bb-box').steps.slice(0, 12).map((x) => x.f), [9, 12, 9, 12, 9, 11, 9, 11, 10, 12, 9, 12]);
});

test('פנטטוני בארבעות: 36 תווים בקבוצות של ארבעה', () => {
  const e = ex('seq4');
  assert.equal(e.steps.length, 36);
  const up = ex('pm-1').steps.slice(0, 12);
  for (let g = 0; g < 9; g++) for (let k = 0; k < 4; k++) assert.deepEqual(e.steps[g * 4 + k], up[g + k]);
});

// ---------- לשונית אקורדים ----------
test('אקורדים: הצורות תואמות לצורות המוכרות', () => {
  const byName = {};
  for (const e of chordEx) for (const st of e.steps) if (!st.rest) byName[st.name] = st;
  const frets = (st) =>
    [6, 5, 4, 3, 2, 1].map((s) => (st.mute.includes(s) ? 'x' : st.notes.find((x) => x.s === s)?.f ?? 0)).join('');
  const expected = { Em: '022000', Am: 'x02210', E: '022100', A: 'x02220', D: 'xx0232', C: 'x32010', G: '320003', Dm: 'xx0231', E7: '020100', A7: 'x02020', B7: 'x21202' };
  for (const [name, shape] of Object.entries(expected)) assert.equal(frets(byName[name]), shape, name);
  for (const st of Object.values(byName)) {
    for (let s = 1; s <= 6; s++) {
      const roles = [st.mute.includes(s), st.open.includes(s), st.notes.some((x) => x.s === s)].filter(Boolean).length;
      assert.equal(roles, 1, `${st.name} מיתר ${s}`);
    }
    assert.equal(new Set(st.notes.map((x) => x.fi)).size, st.notes.length, `${st.name}: אצבע לא חוזרת`);
  }
});

test('אקורדים: התווים בכל אקורד נכונים לפי תיאוריה (שורש, שלישית, חמישית)', () => {
  const T = DATA.theory;
  const frets = {};
  for (const e of chordEx) for (const st of e.steps) if (!st.rest) frets[st.name] = st;
  const OPEN = { 6: 4, 5: 9, 4: 2, 3: 7, 2: 11, 1: 4 };
  for (const [name, st] of Object.entries(frets)) {
    const played = new Set();
    for (let s = 1; s <= 6; s++) {
      if (st.mute.includes(s)) continue;
      const f = st.notes.find((x) => x.s === s)?.f ?? 0;
      played.add((OPEN[s] + f) % 12);
    }
    const tones = new Set(T.parseChord(name).tones);
    for (const p of played) assert.ok(tones.has(p), `${name}: תו ${p} מחוץ לאקורד`);
    for (const t of tones.has(T.parseChord(name).root) ? [T.parseChord(name).root] : []) assert.ok(played.has(t), `${name}: חסר שורש`);
  }
});

test('תרגילי אקורדים: ארבע פעימות לאקורד, ובכל לשונית מעברים ורצפים', () => {
  assert.ok(chordEx.length >= 17);
  for (const e of chordEx) {
    assert.equal(e.beatsPerStep, 4, e.id);
    assert.ok(e.steps.some((x) => !x.rest), e.id);
  }
  const blues = chordEx.find((e) => e.id === 'cp-blues12');
  assert.deepEqual(blues.steps.map((x) => x.name), ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7']);
});

// ---------- טכניקות חדשות ----------
test('ליגטו: פריטה אחת, שלושה Hammer-on ושלושה Pull-off חזרה', () => {
  const e = ex('legato');
  assert.deepEqual(e.steps.map((x) => x.t), [undefined, 'h', 'h', 'h', 'p', 'p', 'p']);
  assert.deepEqual(e.steps.map((x) => x.f), [1, 2, 3, 4, 3, 2, 1]);
});
test('סלייד וויברטו: מסומנים בטכניקה הנכונה', () => {
  assert.deepEqual(ex('slide').steps.map((x) => x.t), [undefined, 's', 's', 's']);
  assert.deepEqual(ex('vibrato').steps.map((x) => x.t), [undefined, 'v', 'v', 'v']);
});
