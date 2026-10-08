const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');

const all = DATA.levels.flatMap((l) => l.exercises);
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

test('הבסיס למתחילים הוסר: אין מדריך, מיתרים פתוחים או אצבע-אחת', () => {
  for (const id of ['guide', 'open', 'f1', 'f2', 'f3', 'f4']) assert.equal(ex(id), undefined, id);
});

test('אין תרגילי אקורדים (הוחלפו בסולמות)', () => {
  assert.ok(all.every((e) => e.mode !== 'chords'));
  assert.ok(DATA.levels[3].exercises.length >= 10);
});

test('מזהי תרגילים ייחודיים', () => {
  assert.equal(new Set(all.map((e) => e.id)).size, all.length);
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
