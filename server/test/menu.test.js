import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMenuPdf, extractItems } from '../menu/parsePdf.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'menus');
const pdf = fs.readFileSync(path.join(dir, 'medica-2026-09-14.pdf'));
const parsedP = parseMenuPdf(pdf);

test('פענוח התפריט תואם לתוצאה שאומתה ידנית', async () => {
  const parsed = await parsedP;
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'medica-2026-09-14.expected.json'), 'utf8'));
  const got = parsed.items.map(({ page, ...i }) => i);
  assert.equal(got.length, expected.length);
  assert.deepEqual(got, expected);
});

test('מטא-דאטה: בית מרקחת, עיר ותאריך', async () => {
  const p = await parsedP;
  assert.equal(p.store, 'מדיקה');
  assert.equal(p.city, 'ראש העין');
  assert.equal(p.date, '14/09/2026');
});

test('אף שורה לא אבדה: מספר סימני ₪ באזור הגלוי = מספר הפריטים בכל עמוד תפרחות', async () => {
  const p = await parsedP;
  const pages = await extractItems(pdf);
  for (const n of [1, 2]) {
    const pg = pages[n - 1];
    const footer = pg.items.find((i) => /עמוד\s*\d+\s*מתוך/.test(i.str)).y;
    const titleY = Math.max(...pg.items.filter((i) => i.h >= 14).map((i) => i.y));
    const shekels = pg.items.filter((i) => i.str.includes('₪') && i.y > titleY && i.y < footer).length;
    assert.equal(p.items.filter((i) => i.page === n).length, shekels, `עמוד ${n}`);
  }
});

test('רק תפרחות: עמוד השמנים והגליליות מדולג', async () => {
  const p = await parsedP;
  assert.ok(p.items.every((i) => i.page !== 3));
  assert.ok(!p.items.some((i) => /שמן|סלים/.test(i.name)));
});

test('לכל פריט יש קטגוריה בפורמט T../C.. וסוג', async () => {
  const p = await parsedP;
  for (const i of p.items) {
    assert.match(i.category, /^T\d+\/C\d+$/, i.name);
    assert.ok(['sativa', 'indica', 'hybrid'].includes(i.type), i.name);
    assert.ok(i.price_ils > 0, i.name);
  }
});

test('תוכן מוסתר מתחת לכותרת התחתונה (overflow) לא נספר פעמיים', async () => {
  const p = await parsedP;
  const keys = p.items.map((i) => `${i.name}|${i.producer}|${i.price_ils}|${i.category}`);
  // "בראון / שיח" מופיע פעמיים באמת במחירים שונים – כל השאר ייחודיים
  assert.equal(new Set(keys).size, keys.length);
});

test('שמות עם פיסוק ומספרים בסדר הנכון', async () => {
  const names = (await parsedP).items.map((i) => i.name);
  for (const n of ["ג'.ו.נ.י 3#", 'די-601', 'די-621', 'וודינג #33', "טי ג'י אי זיץ ג'י", 'אר&אם מיני', 'רוג1']) {
    assert.ok(names.includes(n), n);
  }
  const dalia = (await parsedP).items.find((i) => i.name_raw === 'דליה אדומה מיני T22C4');
  assert.equal(dalia.name, 'דליה אדומה מיני');
});

test('עקביות מול menu-data.json (תפריט 15/02/2026): זנים משותפים מקבלים אותה קטגוריה וסוג', async () => {
  const feb = JSON.parse(fs.readFileSync(path.join(dir, 'medica-2026-02-15.expected.json'), 'utf8'));
  const got = (await parsedP).items;
  let shared = 0;
  for (const e of feb) {
    const same = got.filter((g) => g.name === e.name && g.producer === e.producer && g.category === e.category);
    if (!same.length) continue;
    shared++;
    assert.ok(same.some((g) => g.type === e.type), `${e.name}: צפוי ${e.type}`);
  }
  assert.ok(shared >= 50, `רק ${shared} זנים משותפים`);
});
