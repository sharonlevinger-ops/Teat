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
