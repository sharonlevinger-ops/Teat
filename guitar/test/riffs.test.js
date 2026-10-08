const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');
const { RIFFS } = require('../riffs.js');
const { PATTERNS } = require('../rhythm.js');

const T = DATA.theory;
const OPEN = { 6: 4, 5: 9, 4: 2, 3: 7, 2: 11, 1: 4 };
const pc = (s, f) => (OPEN[s] + f) % 12;

test('ריפים: מזהים ייחודיים, כל תיבה באורך נכון, האורך הכולל מתאים לצעדים', () => {
  assert.ok(RIFFS.length >= 6);
  assert.equal(new Set(RIFFS.map((r) => r.id)).size, RIFFS.length);
  for (const r of RIFFS) {
    for (const b of r.bars) assert.equal(b.steps.length, 4 * r.sub, `${r.id} ${b.label}`);
    assert.equal(r.steps.length, r.bars.length * 4 * r.sub);
    assert.equal(r.barLabels.length, r.bars.length);
    assert.ok(r.howTo.length >= 3 && r.style.text.includes('לא ציטוט'), r.id);
    assert.ok([1, 2, 3].includes(r.level));
  }
});

test('ריפים: כל תו בתוך הצוואר המוצג, אצבע תקינה, ותו פתוח עם אצבע 0', () => {
  for (const r of RIFFS) {
    for (const st of r.steps) {
      if (st.rest) continue;
      assert.ok(st.s >= 1 && st.s <= 6, r.id);
      if (st.f === 0) assert.equal(st.fi, 0, r.id);
      else {
        assert.ok(st.fi >= 1 && st.fi <= 4, `${r.id}: אצבע`);
        assert.ok(st.f >= r.startFret && st.f <= r.startFret + r.frets - 1, `${r.id}: סריג ${st.f} מחוץ לחלון`);
      }
    }
  }
});

test('ריפים: כל התווים שייכים לסולם או לאקורד של התיבה שלהם', () => {
  for (const r of RIFFS) {
    for (const b of r.bars) {
      let allowed;
      if (b.chord) allowed = new Set(T.parseChord(b.chord).tones);
      else {
        const root = T.ROOT_PC[b.root || r.rootName];
        allowed = new Set(T.SCALE_IV[b.scale || r.scale].map((i) => (root + i) % 12));
      }
      for (const st of b.steps) if (!st.rest) assert.ok(allowed.has(pc(st.s, st.f)), `${r.id} ${b.label}: מיתר ${st.s} סריג ${st.f}`);
    }
  }
});

test('תבניות סטרומינג: אורך לפי חלוקת הפעימה, סימנים תקינים, ומתחילות בפריטה', () => {
  assert.ok(PATTERNS.length >= 8);
  assert.equal(new Set(PATTERNS.map((p) => p.id)).size, PATTERNS.length);
  for (const p of PATTERNS) {
    assert.equal(p.pattern.length, 4 * p.sub, p.id);
    assert.ok(p.pattern.every((x) => ['D', 'U', 'M', '-'].includes(x)), p.id);
    assert.ok(p.pattern.some((x) => x !== '-'), p.id);
    assert.ok([1, 2, 3, 4].includes(p.sub));
  }
  assert.ok(PATTERNS.some((p) => p.level === 1) && PATTERNS.some((p) => p.level === 3));
});
