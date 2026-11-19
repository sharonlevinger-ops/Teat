import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, splitTasks } from '../js/parser.js';

const NOW = new Date(2026, 10, 16, 9, 0); // Monday 16/11/2026

test('event with time and follow-up tasks', () => {
  const r = parseInput('אימון בשעה 17:00 ולאחר מכן לקנות חלב ופירות', NOW);
  assert.equal(r.kind, 'event');
  assert.equal(r.title, 'אימון');
  assert.equal(r.date, '2026-11-16');
  assert.equal(r.time, '17:00');
  assert.deepEqual(r.tasks, ['לקנות חלב', 'לקנות פירות']);
});

test('weekday + explicit date + time', () => {
  const r = parseInput('פגישה עם חשמלאי ביום שלישי 25/11 בשעה 17:00', NOW);
  assert.equal(r.title, 'פגישה עם חשמלאי');
  assert.equal(r.date, '2026-11-25');
  assert.equal(r.time, '17:00');
});

test('spoken: tomorrow at five', () => {
  const r = parseInput('מחר בחמש פגישה עם חשמלאי ולאחר מכן לקנות חלב', NOW);
  assert.equal(r.date, '2026-11-17');
  assert.equal(r.time, '17:00');
  assert.equal(r.title, 'פגישה עם חשמלאי');
  assert.deepEqual(r.tasks, ['לקנות חלב']);
});

test('weekday only', () => {
  const r = parseInput('רופא שיניים ביום חמישי בשעה 8:30', NOW);
  assert.equal(r.date, '2026-11-19');
  assert.equal(r.time, '08:30');
  assert.equal(r.title, 'רופא שיניים');
});

test('word hour with half and evening', () => {
  const r = parseInput('ארוחה אצל אמא בשמונה וחצי בערב', NOW);
  assert.equal(r.time, '20:30');
  assert.equal(r.title, 'ארוחה אצל אמא');
});

test('plain task with due date', () => {
  const r = parseInput('מחר לקנות מתנה', NOW);
  assert.equal(r.kind, 'task');
  assert.equal(r.date, '2026-11-17');
  assert.equal(r.title, 'לקנות מתנה');
});

test('plain task', () => {
  const r = parseInput('להתקשר לביטוח', NOW);
  assert.equal(r.kind, 'task');
  assert.equal(r.date, null);
});

test('split tasks with commas and verbs', () => {
  assert.deepEqual(splitTasks('לקנות חלב, לחם וביצים ולהתקשר לאבא'), ['לקנות חלב', 'לקנות לחם', 'לקנות ביצים', 'להתקשר לאבא']);
});

test('dot time 17.30', () => {
  const r = parseInput('טסט לרכב ב-17.30 מחרתיים', NOW);
  assert.equal(r.time, '17:30');
  assert.equal(r.date, '2026-11-18');
  assert.equal(r.title, 'טסט לרכב');
});

test('dictation style: bare "ב-5" means 17:00', () => {
  for (const t of ['מחר ב-5 פגישה עם חשמלאי', 'מחר ב5 פגישה עם חשמלאי', 'מחר ב 5 פגישה עם חשמלאי', 'מחר ב-5:00 פגישה עם חשמלאי']) {
    const r = parseInput(t, NOW);
    assert.equal(r.time, '17:00', t);
    assert.equal(r.title, 'פגישה עם חשמלאי', t);
  }
});

test('leading zero keeps morning time', () => {
  assert.equal(parseInput('מחר ב-06:00 ריצה', NOW).time, '06:00');
});

test('numbers that are not times stay in the text', () => {
  const r = parseInput('טיפול לרכב בעוד 3 ימים ב-8', NOW);
  assert.equal(r.date, '2026-11-19');
  assert.equal(r.time, '08:00');
  assert.equal(parseInput('לקנות 2 לחמים', NOW).title, 'לקנות 2 לחמים');
});

test('month names and "לחודש"', () => {
  assert.equal(parseInput('פגישה ב-25 בנובמבר בשעה 10', NOW).date, '2026-11-25');
  assert.equal(parseInput('פגישה ה-25 לחודש', NOW).date, '2026-11-25');
});
