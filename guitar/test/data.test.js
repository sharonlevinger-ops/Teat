const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');

const all = DATA.levels.flatMap((l) => l.exercises);
const practice = all.filter((e) => e.type !== 'guide');
const single = practice.filter((e) => e.mode !== 'chords');
const chords = practice.filter((e) => e.mode === 'chords');

test('יש ארבע רמות, ובכל אחת תרגילים', () => {
  assert.equal(DATA.levels.length, 4);
  for (const l of DATA.levels) assert.ok(l.exercises.length >= 4, `רמה ${l.id}`);
});

test('הרמה הראשונה מתחילה במדריך ובתרגילי מיתרים פתוחים ואצבע אחת בכל פעם', () => {
  const ids = DATA.levels[0].exercises.map((e) => e.id);
  assert.deepEqual(ids.slice(0, 6), ['guide', 'open', 'f1', 'f2', 'f3', 'f4']);
});

test('מזהי תרגילים ייחודיים', () => {
  assert.equal(new Set(all.map((e) => e.id)).size, all.length);
});

test('כל תו תקין: מיתר 1-6, סריג 0 עד סוף החלון, אצבע 0-4', () => {
  for (const ex of single) {
    assert.ok(ex.steps.length >= 2, ex.id);
    const start = ex.startFret || 1;
    for (const st of ex.steps) {
      assert.ok(st.s >= 1 && st.s <= 6, `${ex.id} מיתר ${st.s}`);
      assert.ok(st.f === 0 || (st.f >= start && st.f <= start + ex.frets - 1), `${ex.id} סריג ${st.f}`);
      assert.ok(st.fi >= 0 && st.fi <= 4, `${ex.id} אצבע ${st.fi}`);
      assert.equal(st.f === 0, st.fi === 0, `${ex.id}: מיתר פתוח = בלי אצבע`);
    }
  }
});

test('בתנוחה הראשונה האצבע שווה לסריג', () => {
  for (const ex of single.filter((e) => !e.startFret)) for (const st of ex.steps) assert.equal(st.fi, st.f, ex.id);
});

test('תרגילי אצבע אחת: כל מיתר פעם פתוח ופעם לחוץ באותו סריג', () => {
  for (const [id, fret] of [['f1', 1], ['f2', 2], ['f3', 3], ['f4', 4]]) {
    const ex = all.find((e) => e.id === id);
    assert.equal(ex.steps.length, 12, id);
    for (let i = 0; i < 12; i += 2) {
      assert.equal(ex.steps[i].f, 0);
      assert.equal(ex.steps[i + 1].f, fret);
      assert.equal(ex.steps[i].s, ex.steps[i + 1].s);
    }
  }
});

test('ספיידר: מכסה את כל המיתרים והסריגים, בלי תו כפול ברצף', () => {
  for (const id of ['1-2', '2-1', '2-2', 'sp-up']) {
    const ex = all.find((e) => e.id === id);
    assert.equal(new Set(ex.steps.map((x) => `${x.s}-${x.f}`)).size, 24, id);
    for (let i = 0; i < ex.steps.length; i++) {
      const a = ex.steps[i], b = ex.steps[(i + 1) % ex.steps.length];
      assert.ok(!(a.s === b.s && a.f === b.f), `${id} חזרה ברצף בצעד ${i}`);
    }
  }
  assert.equal(all.find((e) => e.id === '1-2').steps.length, 46);
});

test('Hammer-on/Pull-off: כל קבוצה מתחילה בפריטה, ואחריה h ואז p באותו מיתר', () => {
  for (const id of ['2-3', '2-4']) {
    const ex = all.find((e) => e.id === id);
    assert.equal(ex.steps.length % 3, 0, id);
    for (let i = 0; i < ex.steps.length; i += 3) {
      const [a, b, c] = ex.steps.slice(i, i + 3);
      assert.equal(a.t, undefined);
      assert.equal(b.t, 'h');
      assert.equal(c.t, 'p');
      assert.ok(a.s === b.s && b.s === c.s);
      assert.ok(b.f > a.f && c.f === a.f);
    }
  }
});

test('פנטטוני: תנוחה ראשונה בסריגים 5-8, שני תווים בכל מיתר, ואצבע 1 בסריג 5', () => {
  const ex = all.find((e) => e.id === 'penta');
  assert.equal(ex.startFret, 5);
  const up = ex.steps.slice(0, 12);
  for (let s = 6, i = 0; s >= 1; s--, i += 2) {
    assert.ok(up[i].s === s && up[i + 1].s === s);
    assert.deepEqual([up[i].f, up[i].fi], [5, 1]);
    assert.ok([7, 8].includes(up[i + 1].f));
  }
  assert.equal(ex.steps.length, 22);
});

test('סולם דו מז׳ור: 8 תווים עולים והצלילים נכונים (C D E F G A B C)', () => {
  const ex = all.find((e) => e.id === 'scale-c');
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const open = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
  const up = ex.steps.slice(0, 8).map((x) => names[(open[x.s] + x.f) % 12]);
  assert.deepEqual(up, ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
});

test('אקורדים: האצבעות והמיתרים תואמים לצורות המוכרות', () => {
  const byName = {};
  for (const ex of chords) for (const st of ex.steps) if (!st.rest) byName[st.name] = st;
  const frets = (st) => {
    const out = {};
    for (let s = 1; s <= 6; s++) {
      if (st.mute.includes(s)) out[s] = 'x';
      else out[s] = st.notes.find((x) => x.s === s)?.f ?? 0;
    }
    return [6, 5, 4, 3, 2, 1].map((s) => out[s]).join('');
  };
  assert.equal(frets(byName.Em), '022000');
  assert.equal(frets(byName.Am), 'x02210');
  assert.equal(frets(byName.E), '022100');
  assert.equal(frets(byName.A), 'x02220');
  assert.equal(frets(byName.D), 'xx0232');
  assert.equal(frets(byName.C), 'x32010');
  for (const st of Object.values(byName)) {
    // כל מיתר: מוחלש, פתוח או לחוץ, בלי חפיפה
    for (let s = 1; s <= 6; s++) {
      const roles = [st.mute.includes(s), st.open.includes(s), st.notes.some((x) => x.s === s)].filter(Boolean).length;
      assert.equal(roles, 1, `${st.name} מיתר ${s}`);
    }
    assert.equal(new Set(st.notes.map((x) => x.fi)).size, st.notes.length, `${st.name}: אצבע לא חוזרת`);
  }
});

test('תרגילי אקורדים: פעימות לאקורד, ובכל אחד לפחות אקורד אחד', () => {
  assert.ok(chords.length >= 5);
  for (const ex of chords) {
    assert.equal(ex.beatsPerStep, 4, ex.id);
    assert.ok(ex.steps.some((s) => !s.rest), ex.id);
  }
});

test('מהירות עולה: הגדרות סבירות', () => {
  for (const ex of practice.filter((e) => e.ramp)) {
    assert.ok(ex.ramp.max > ex.startBpm && ex.ramp.max <= 160, ex.id);
    assert.ok(ex.ramp.step >= 1 && ex.ramp.step <= 10, ex.id);
  }
});

test('כל תרגיל כולל הוראות, מטרה וקצב התחלתי סביר (תרגילים למתחילים: עד 45)', () => {
  for (const ex of practice) {
    assert.ok(ex.howTo.length >= 2 && ex.goal && ex.title, ex.id);
    assert.ok(ex.startBpm >= 30 && ex.startBpm <= 80, ex.id);
  }
  for (const ex of DATA.levels[0].exercises.filter((e) => e.type !== 'guide')) assert.ok(ex.startBpm <= 45, ex.id);
});
