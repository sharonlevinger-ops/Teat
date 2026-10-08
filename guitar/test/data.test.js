const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');

const all = DATA.levels.flatMap((l) => l.exercises || []);

test('יש תרגילים ברמה הראשונה', () => {
  assert.ok(all.length >= 4);
});

test('כל תו תקין: מיתר 1-6, סריג 1-5, אצבע 1-4', () => {
  for (const ex of all) {
    assert.ok(ex.steps.length >= 2, ex.id);
    for (const st of ex.steps) {
      assert.ok(st.s >= 1 && st.s <= 6, `${ex.id} מיתר ${st.s}`);
      assert.ok(st.f >= 1 && st.f <= ex.frets, `${ex.id} סריג ${st.f}`);
      assert.ok(st.fi >= 1 && st.fi <= 4, `${ex.id} אצבע ${st.fi}`);
    }
  }
});

test('בתנוחה הראשונה האצבע שווה לסריג', () => {
  for (const ex of all) for (const st of ex.steps) assert.equal(st.fi, st.f, ex.id);
});

test('בלי חזרה זהה בתחילת/סוף הלולאה בספיידר', () => {
  const sp = all.find((e) => e.id === '1-2');
  const a = sp.steps[0], b = sp.steps[sp.steps.length - 1];
  assert.ok(!(a.s === b.s && a.f === b.f));
  assert.equal(sp.steps.length, 46); // 24 עולה + 22 יורד (בלי תו כפול בתפר)
});

test('כל תרגיל כולל הוראות, מטרה וקצב התחלתי סביר', () => {
  for (const ex of all) {
    assert.ok(ex.howTo.length >= 2 && ex.goal && ex.title, ex.id);
    assert.ok(ex.startBpm >= 30 && ex.startBpm <= 80, ex.id);
  }
});

test('ספיידר עם דפוסים: מכסה את כל המיתרים והסריגים, בלי תו כפול ברצף', () => {
  for (const id of ['2-1', '2-2']) {
    const ex = all.find((e) => e.id === id);
    const keys = new Set(ex.steps.map((x) => `${x.s}-${x.f}`));
    assert.equal(keys.size, 24, id);
    for (let i = 0; i < ex.steps.length; i++) {
      const a = ex.steps[i], b = ex.steps[(i + 1) % ex.steps.length];
      assert.ok(!(a.s === b.s && a.f === b.f), `${id} חזרה ברצף בצעד ${i}`);
    }
  }
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

test('מזהי תרגילים ייחודיים ורמה 2 קיימת', () => {
  assert.equal(new Set(all.map((e) => e.id)).size, all.length);
  assert.ok(all.filter((e) => e.id.startsWith('2-')).length >= 6);
});
