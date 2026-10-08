const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../exercises.js');
const SONGS = require('../songs.js');

const T = DATA.theory;
const pcs = (root, scale) => new Set(T.SCALE_IV[scale].map((i) => (T.ROOT_PC[root] + i) % 12));
const OPEN = { 6: 4, 5: 9, 4: 2, 3: 7, 2: 11, 1: 4 };
const pc = (s, f) => (OPEN[s] + f) % 12;

test('מאגר השירים: שדות חובה, מזהים ייחודיים, מפתח תקין', () => {
  assert.ok(SONGS.length >= 25);
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
  for (const s of SONGS) {
    assert.ok(s.title && s.artist && s.titleHe && s.artistHe, s.id);
    assert.ok(T.ROOT_PC[s.key.root] !== undefined, `${s.id} מפתח`);
    assert.ok(['major', 'minor'].includes(s.key.mode), s.id);
    assert.ok(['high', 'medium'].includes(s.conf), s.id);
    assert.ok(s.scales.length >= 2, s.id);
    assert.ok(s.tips.length >= 1, s.id);
  }
});

test('כל האקורדים בשירים מתפענחים', () => {
  for (const s of SONGS) for (const c of s.chords) assert.ok(T.parseChord(c), `${s.id}: ${c}`);
});

test('שורש כל אקורד שייך לאחד הסולמות שמוצעים לשיר (הסולמות מכסים את האקורדים)', () => {
  for (const s of SONGS) {
    const union = new Set();
    for (const sc of s.scales) for (const p of pcs(sc.root || s.key.root, sc.scale)) union.add(p);
    for (const c of s.chords) assert.ok(union.has(T.parseChord(c).root), `${s.id}: האקורד ${c} מחוץ לכל הסולמות`);
  }
});

test('הסולם הראשון של כל שיר מתחיל בשורש של המפתח', () => {
  for (const s of SONGS) assert.equal(s.scales[0].root || s.key.root, s.key.root, s.id);
});

test('כל סולם בכל שיר מייצר תנוחות תקינות', () => {
  for (const s of SONGS) {
    for (const sc of s.scales) {
      const root = sc.root || s.key.root;
      assert.ok(T.SCALE_IV[sc.scale], `${s.id}: ${sc.scale}`);
      const flats = T.useFlats(root, ['minorPent', 'blues', 'naturalMinor', 'dorian', 'harmonicMinor', 'phrygianDominant'].includes(sc.scale) ? 'minor' : 'major');
      for (let p = 1; p <= T.POSITIONS(sc.scale); p++) assert.ok(T.genExercise(sc.scale, T.ROOT_PC[root], p, flats).steps.length > 5);
    }
  }
});

test('מחולל התנוחות: כל סולם, כל מפתח, כל תנוחה: כל התווים בסולם, בתוך הצוואר, והאצבעות תקינות', () => {
  for (const scale of Object.keys(T.SCALE_IV)) {
    for (let root = 0; root < 12; root++) {
      const set = new Set(T.SCALE_IV[scale].map((i) => (root + i) % 12));
      for (let p = 1; p <= T.POSITIONS(scale); p++) {
        const e = T.genExercise(scale, root, p, false);
        const label = `${scale} שורש ${root} תנוחה ${p}`;
        const fr = e.steps.map((x) => x.f);
        assert.ok(Math.min(...fr) >= 1 && Math.max(...fr) <= 18, `${label}: סריגים ${Math.min(...fr)}-${Math.max(...fr)}`);
        for (const st of e.steps) {
          assert.ok(set.has(pc(st.s, st.f)), `${label}: תו מחוץ לסולם`);
          assert.ok(st.f >= e.startFret && st.f <= e.startFret + e.frets - 1, `${label}: מחוץ לחלון`);
          assert.ok(st.fi >= 1 && st.fi <= 4, `${label}: אצבע`);
        }
        const per = {};
        for (const st of e.steps) (per[st.s] ||= new Set()).add(st.f);
        for (let s = 1; s <= 6; s++) assert.ok(per[s].size >= 2, `${label} מיתר ${s}`);
      }
    }
  }
});

test('מחולל: לה מינורי פנטטוני בתנוחה 1 זהה לתרגיל הקבוע', () => {
  const g = T.genExercise('minorPent', 9, 1, false);
  const fixed = DATA.penta.sections[0].exercises[0];
  assert.deepEqual(g.steps, fixed.steps);
  assert.equal(g.startFret, fixed.startFret);
});

test('מחולל: מז׳ורי פנטטוני הוא המינורי היחסי (דו מז׳ור = לה מינור)', () => {
  const major = T.genExercise('majorPent', 0, 1, false);
  const minor = T.genExercise('minorPent', 9, 1, false);
  assert.deepEqual(major.steps, minor.steps);
});

test('שמות תווים: במול בסי במול ודיאז בפה דיאז', () => {
  assert.equal(T.noteNameOf(10, true), 'Bb');
  assert.equal(T.noteNameOf(10, false), 'A#');
  assert.equal(T.useFlats('Bb', 'major'), true);
  assert.equal(T.useFlats('F', 'minor'), true);
  assert.equal(T.useFlats('F#', 'minor'), false);
  assert.equal(T.useFlats('E', 'minor'), false);
  const e = T.genExercise('minorPent', 10, 1, true);
  assert.match(e.title, /^Bb /);
});

test('תווי אקורד: Am = A C E, E7 = E G# B D, G5 = G D, B7 = B D# F# A', () => {
  const names = (c, f) => T.chordToneNames(c, f).join(' ');
  assert.equal(names('Am'), 'A C E');
  assert.equal(names('E7'), 'E G# B D');
  assert.equal(names('G5'), 'G D');
  assert.equal(names('B7'), 'B D# F# A');
  assert.equal(names('Bb', true), 'Bb D F');
  assert.equal(names('A7sus4'), 'A D E G');
  assert.equal(T.parseChord('H'), null);
  assert.equal(T.parseChord('Am9x'), null);
});

test('חיפוש שירים: עברית ואנגלית, שם להקה ושם שיר, כתיב מדויק ולא מדויק', () => {
  const find = (q) => SONGS.search(SONGS, q).map((s) => s.id);
  assert.ok(find("Don't Cry").includes('gnr-dont-cry'));
  assert.ok(find('dont cry').includes('gnr-dont-cry'));
  assert.ok(find('דונט קריי').includes('gnr-dont-cry'));
  assert.ok(find('גאנז אנד רוזס').includes('gnr-dont-cry'));
  assert.ok(find('gnr').includes('gnr-sweet-child'));
  assert.ok(find('Slash').includes('gnr-dont-cry'));
  assert.ok(find('אירוסמית׳').includes('aero-walk-this-way'));
  assert.ok(find('joe perry').includes('aero-sweet-emotion'));
  assert.ok(find('hotel california').includes('eagles-hotel'));
  assert.ok(find('בלוז').includes('blues-12-e'));
  assert.deepEqual(find('zzzz לא קיים'), []);
  assert.equal(find('').length, SONGS.length);
});

test('מאגר השירים כולל את הדוגמה של המשתמש: Don\'t Cry של Guns N\' Roses, עם הערת כיוון חצי טון', () => {
  const s = SONGS.find((x) => x.id === 'gnr-dont-cry');
  assert.equal(s.tuning, 'halfDown');
  assert.equal(s.key.root, 'A');
  assert.equal(s.scales[0].scale, 'naturalMinor');
});
