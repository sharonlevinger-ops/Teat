import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

const pdfPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'menus', 'medica-2026-09-14.pdf');

test('API: העלאת תפריט, חיפוש, סינון וכרטיס זן', async (t) => {
  const db = openDb(':memory:');
  const server = createApp(db).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const form = new FormData();
  form.append('menu', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), 'menu.pdf');
  const up = await (await fetch(`${base}/api/menus`, { method: 'POST', body: form })).json();
  assert.equal(up.count, 192);

  // חיפוש בלי "מיני": מוצא גם את "מיני חמניה צהובה" וגם את "חמניה צהובה"
  const s = await (await fetch(`${base}/api/search?q=${encodeURIComponent('חמניה צהובה מיני')}`)).json();
  assert.deepEqual(s.items.map((i) => i.name).sort(), ['חמניה צהובה', 'מיני חמניה צהובה']);

  const f = await (await fetch(`${base}/api/search?category=T15/C3&type=indica`)).json();
  assert.deepEqual(f.items.map((i) => i.name).sort(), ['אור', 'דליה אדומה', 'קורל']);

  const thc = await (await fetch(`${base}/api/search?thcMax=5`)).json();
  assert.ok(thc.items.length > 0 && thc.items.every((i) => i.thc <= 5));

  const prod = await (await fetch(`${base}/api/search?producer=${encodeURIComponent('פלואוז')}`)).json();
  assert.ok(prod.items.every((i) => i.producer === 'פלואוז'));

  const opts = await (await fetch(`${base}/api/filters`)).json();
  assert.equal(opts.categories[0], 'T22/C4');
  assert.ok(opts.producers.includes('טוגדר'));

  // כרטיס זן בלי נתוני מקור: שדות null ("לא זמין"), אבל מופעים בתפריט קיימים
  const card = await (await fetch(`${base}/api/strains/${s.items[0].strain_id}`)).json();
  assert.equal(card.fields.type, null);
  assert.equal(card.rating, null);
  // 'מיני' ורגיל של אותו יצרן = אותו זן (גודל אריזה בלבד)
  assert.equal(card.menu_appearances.length, 2);

  const bad = await fetch(`${base}/api/menus`, { method: 'POST', body: new FormData() });
  assert.equal(bad.status, 400);

  const sources = await (await fetch(`${base}/api/sources`)).json();
  assert.equal(sources.length, 5);
});
