import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchKey, normalizeType, parseCategory, parsePercent, normalizeRating, parseLineage, excerpt, valuesAgree } from '../normalize.js';

test('searchKey מסיר מיני/סמול ופיסוק', () => {
  assert.equal(searchKey('מיני חמניה צהובה'), searchKey('חמניה צהובה'));
  assert.equal(searchKey('זיו סמול'), 'זיו');
  assert.equal(searchKey('אקספלורר מיניז'), 'אקספלורר');
  assert.equal(searchKey("ג'.ו.נ.י 3#"), 'ג ו נ י 3');
  assert.equal(searchKey('Blue Dream Mini'), 'blue dream');
  assert.equal(searchKey('ניירובי'), searchKey('ניירובי'));
});

test('normalizeType', () => {
  assert.equal(normalizeType('סאטיבה'), 'sativa');
  assert.equal(normalizeType('אינדיקה דומיננטית'), 'indica');
  assert.equal(normalizeType('הייבריד'), 'hybrid');
  assert.equal(normalizeType('Hybrid'), 'hybrid');
  assert.equal(normalizeType('משהו'), null);
  assert.equal(normalizeType(null), null);
});

test('קטגוריה ואחוזים', () => {
  assert.deepEqual(parseCategory('T22/C4'), { thc: 22, cbd: 4 });
  assert.deepEqual(parseCategory('לא ידוע'), { thc: null, cbd: null });
  assert.equal(parsePercent('20-24%'), 22);
  assert.equal(parsePercent('לא צוין'), null);
});

test('ציון לסקאלה 1-5', () => {
  assert.equal(normalizeRating('4.2'), 4.2);
  assert.equal(normalizeRating('8', 10), 4);
  assert.equal(normalizeRating('', 5), null);
  assert.equal(normalizeRating('7', 5), null);
});

test('שושלת', () => {
  assert.deepEqual(parseLineage('א × ב'), { parents: ['א', 'ב'] });
  assert.deepEqual(parseLineage('OG Kush x Durban'), { parents: ['OG Kush', 'Durban'] });
  assert.equal(parseLineage('לא ידוע'), null);
});

test('excerpt מקצר ל-200 תווים לכל היותר', () => {
  const long = 'מילה '.repeat(100);
  const e = excerpt(long);
  assert.ok(e.length <= 201 && e.endsWith('…'));
});

test('valuesAgree', () => {
  assert.equal(valuesAgree('type', 'sativa', 'indica'), false);
  assert.equal(valuesAgree('thc', 22, 21), true);
  assert.equal(valuesAgree('lineage', { parents: ['א', 'ב'] }, { parents: ['ב', 'א'] }), true);
});
