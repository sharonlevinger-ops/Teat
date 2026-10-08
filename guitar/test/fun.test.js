const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');
const F = require('../fun.js');

const T = DATA.theory;
const pcsOf = (root, scale) => new Set(T.SCALE_IV[scale].map((i) => (root + i) % 12));

test('ג׳אם: בכל סגנון ובכל 12 המפתחות כל האקורדים מתפענחים, ושורשיהם בתוך הסולמות המוצעים', () => {
  for (const p of F.JAM) {
    assert.ok(p.scales.length >= 2 && p.tips.length >= 1 && ['rock', 'shuffle', 'ballad'].includes(p.drums), p.id);
    for (let root = 0; root < 12; root++) {
      const chords = F.jamChords(p, root, root === 1 || root === 3 || root === 5 || root === 8 || root === 10);
      assert.equal(chords.length, p.bars.length, p.id);
      const union = new Set();
      for (const [sc] of p.scales) assert.ok(T.SCALE_IV[sc], `${p.id}: ${sc}`), pcsOf(root, sc).forEach((x) => union.add(x));
      for (const c of chords) {
        const ch = T.parseChord(c);
        assert.ok(ch, `${p.id}: ${c}`);
        assert.ok(union.has(ch.root), `${p.id} שורש ${root}: האקורד ${c} מחוץ לכל הסולמות`);
      }
    }
  }
});

test('ג׳אם: בלוז 12 תיבות באי = E7 x4, A7 x2, E7 x2, B7, A7, E7, B7', () => {
  const blues = F.JAM.find((p) => p.id === 'blues');
  assert.deepEqual(F.jamChords(blues, 4, false), ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7']);
  assert.deepEqual(F.jamChords(F.JAM.find((p) => p.id === 'rock-minor'), 9, false), ['Am', 'G', 'F', 'G']);
  assert.deepEqual(F.jamChords(F.JAM.find((p) => p.id === 'andalusian'), 9, false), ['Am', 'G', 'F', 'E']);
  assert.deepEqual(F.jamChords(F.JAM.find((p) => p.id === 'pop'), 0, false), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(F.jamChords(F.JAM.find((p) => p.id === 'mixo-rock'), 2, false).slice(0, 3), ['D', 'C', 'G']);
  assert.deepEqual(F.jamChords(F.JAM.find((p) => p.id === 'blues'), 10, true).slice(0, 5), ['Bb7', 'Bb7', 'Bb7', 'Bb7', 'Eb7']);
});

test('חידון: התו בכל מיתר וסריג נכון', () => {
  assert.equal(F.noteAt(6, 0), 4); // E
  assert.equal(F.noteAt(5, 3), 0); // C
  assert.equal(F.noteAt(2, 1), 0); // C
  assert.equal(F.noteAt(1, 12), 4); // E
  assert.equal(F.noteAt(3, 4), 11); // B
  assert.equal(F.noteAt(4, 5), 7); // G
});

test('כוונונים: רגיל, חצי טון למטה, טון שלם למטה (D G C F A D) ו-Drop D', () => {
  const names = (id, flats) => F.TUNINGS.find((t) => t.id === id).midi.map((m) => T.noteNameOf(m, flats)).join(' ');
  assert.equal(names('standard'), 'E A D G B E');
  assert.equal(names('half', true), 'Eb Ab Db Gb Bb Eb');
  assert.equal(names('whole'), 'D G C F A D');
  assert.equal(names('dropd'), 'D A D G B E');
});

test('רצף ימי תרגול', () => {
  assert.equal(F.computeStreak(['2026-10-08', '2026-10-07', '2026-10-06'], '2026-10-08'), 3);
  assert.equal(F.computeStreak(['2026-10-07', '2026-10-06'], '2026-10-08'), 2); // היום עוד לא תרגלת
  assert.equal(F.computeStreak(['2026-10-05'], '2026-10-08'), 0);
  assert.equal(F.computeStreak([], '2026-10-08'), 0);
  assert.equal(F.computeStreak(['2026-10-08', '2026-10-06'], '2026-10-08'), 1);
  assert.equal(F.computeStreak(['2026-02-28', '2026-03-01'], '2026-03-01'), 2); // מעבר חודש
});

test('תכנון אימון יומי: דטרמיניסטי, קיים ותקין, ומשתנה מיום ליום', () => {
  const all = [
    ...DATA.levels.flatMap((l) => l.exercises),
    ...DATA.penta.sections.flatMap((s) => s.exercises),
  ].map((e) => e.id);
  const seen = new Set();
  for (let seed = 20000; seed < 20040; seed++) {
    const a = F.dailyPlan(seed, DATA);
    const b = F.dailyPlan(seed, DATA);
    assert.deepEqual(a.warm.map((e) => e.id), b.warm.map((e) => e.id));
    for (const e of [...a.warm, a.tech]) assert.ok(all.includes(e.id));
    assert.ok(a.jam.preset.id && a.jam.rootPc >= 0 && a.jam.rootPc < 12);
    assert.ok(a.challenge);
    assert.notEqual(a.warm[0].id, a.warm[1].id);
    seen.add(a.tech.id + a.warm[0].id + a.jam.preset.id);
  }
  assert.ok(seen.size > 10, 'האימון צריך להשתנות');
});

test('הישגים: מתעוררים לפי תנאים', () => {
  const st = { totalDays: 0, streak: 0, uniqueExercises: 0, bests: {}, jams: 0, quizBest: 0 };
  assert.deepEqual(F.ACHIEVEMENTS.filter((a) => a.check(st)).map((a) => a.id), []);
  const rich = { totalDays: 12, streak: 7, uniqueExercises: 25, bests: { '1-2': 100 }, jams: 2, quizBest: 10 };
  assert.equal(F.ACHIEVEMENTS.filter((a) => a.check(rich)).length, F.ACHIEVEMENTS.length);
  assert.equal(new Set(F.ACHIEVEMENTS.map((a) => a.id)).size, F.ACHIEVEMENTS.length);
});

test('אתגרים יצירתיים: לפחות 12 ובלי כפילויות', () => {
  assert.ok(F.CHALLENGES.length >= 12);
  assert.equal(new Set(F.CHALLENGES).size, F.CHALLENGES.length);
});
