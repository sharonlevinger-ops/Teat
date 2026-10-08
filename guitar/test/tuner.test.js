const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../tuner.js');

const SR = 48000;
// צליל גיטרה מלאכותי: יסוד חלש ומעליו הרמוניות חזקות (המקרה שמבלבל אלגוריתמים פשוטים)
function wave(freq, { sr = SR, n = 4096, harmonics = [1, 0.6, 0.8, 0.5], noise = 0 } = {}) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * i) / sr)));
    b[i] = 0.15 * v + noise * (Math.random() - 0.5);
  }
  return b;
}
const centsDiff = (a, b) => 1200 * Math.log2(a / b);

test('זיהוי גובה: כל מיתרי הגיטרה בכיוון רגיל, בדיוק של 3 סנט', () => {
  const strings = { E2: 82.407, A2: 110.0, D3: 146.832, G3: 195.998, B3: 246.942, E4: 329.628 };
  for (const [name, f] of Object.entries(strings)) {
    const r = U.detectPitch(wave(f), SR);
    assert.ok(r, name);
    assert.ok(Math.abs(centsDiff(r.freq, f)) < 3, `${name}: ${r.freq}`);
  }
});

test('זיהוי גובה: גם בקצב דגימה של 44.1kHz, עם רעש, ועם יסוד חלש', () => {
  const r = U.detectPitch(wave(110, { sr: 44100, noise: 0.05, harmonics: [0.15, 1, 0.8, 0.6] }), 44100);
  assert.ok(r);
  assert.ok(Math.abs(centsDiff(r.freq, 110)) < 5, String(r.freq));
});

test('זיהוי גובה: כיוון Drop D וטון שלם למטה (D2 ו-D3 נמוכים)', () => {
  for (const f of [73.416, 98.0, 87.307]) {
    const r = U.detectPitch(wave(f), SR);
    assert.ok(r && Math.abs(centsDiff(r.freq, f)) < 4, String(f));
  }
});

test('שקט או רעש חלש מחזירים null', () => {
  assert.equal(U.detectPitch(new Float32Array(4096), SR), null);
  const n = new Float32Array(4096).map(() => (Math.random() - 0.5) * 0.004);
  assert.equal(U.detectPitch(n, SR), null);
});

test('הסטייה בסנטים והמיתר הקרוב: מיתר A מעט גבוה/נמוך, כיוון חצי טון למטה', () => {
  const std = [40, 45, 50, 55, 59, 64];
  const a = U.nearestString(110 * Math.pow(2, 10 / 1200), std);
  assert.equal(a.string, 5);
  assert.equal(a.cents, 10);
  const b = U.nearestString(110 * Math.pow(2, -20 / 1200), std);
  assert.equal(b.cents, -20);
  const half = std.map((m) => m - 1);
  const c = U.nearestString(U.freqOfMidi(44), half);
  assert.equal(c.string, 5);
  assert.equal(c.cents, 0);
  assert.equal(U.noteInfo(440).name, 'A');
  assert.equal(U.noteInfo(82.41).name, 'E');
});
