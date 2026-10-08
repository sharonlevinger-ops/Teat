const { test } = require('node:test');
const assert = require('node:assert/strict');
const { merge, toCode, fromCode, pick } = require('../sync.js');

test('מיזוג: איחוד תרגולים לפי זמן, ימי תרגול, ומקסימום ג׳אמים', () => {
  const a = { log: { x: [{ at: '2026-01-01T10:00:00Z', bpm: 60 }] }, active: ['2026-01-01'], jams: 2, custom: [], customDeleted: [] };
  const b = { log: { x: [{ at: '2026-01-02T10:00:00Z', bpm: 70 }, { at: '2026-01-01T10:00:00Z', bpm: 60 }], y: [{ at: '2026-01-03T10:00:00Z', bpm: 50 }] }, active: ['2026-01-02', '2026-01-01'], jams: 5 };
  const m = merge(a, b);
  assert.equal(m.log.x.length, 2);
  assert.deepEqual(m.log.x.map((r) => r.bpm), [60, 70]);
  assert.equal(m.log.y.length, 1);
  assert.deepEqual(m.active, ['2026-01-01', '2026-01-02']);
  assert.equal(m.jams, 5);
  assert.deepEqual(merge(a, b), merge(b, a)); // לא תלוי בסדר
  assert.deepEqual(merge(m, m), m); // אידמפוטנטי
});

test('מיזוג: שיר שנמחק באחד הצדדים לא חוזר, שירים חדשים מצטרפים', () => {
  const a = { custom: [{ id: 'my-1', title: 'א' }, { id: 'my-2', title: 'ב' }], customDeleted: [] };
  const b = { custom: [{ id: 'my-1', title: 'א' }], customDeleted: ['my-2'] };
  const m = merge(a, b);
  assert.deepEqual(m.custom.map((c) => c.id), ['my-1']);
  assert.deepEqual(m.customDeleted, ['my-2']);
  assert.deepEqual(merge(m, a).custom.map((c) => c.id), ['my-1']);
});

test('קוד גיבוי ידני: הלוך וחזור, ודחיית קוד שגוי', () => {
  const st = { log: { x: [{ at: 'a', bpm: 1 }] }, active: ['2026-01-01'], jams: 3, custom: [{ id: 'my-1', title: 'שיר בעברית' }], customDeleted: [], lefty: true };
  const back = fromCode(toCode(st));
  assert.deepEqual(back, pick(st));
  assert.throws(() => fromCode('hello'));
  assert.throws(() => fromCode('G1.@@@'));
});
