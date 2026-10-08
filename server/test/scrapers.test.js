// בדיקה לכל scraper מול דף שמור. דפים סינתטיים בודקים את החילוץ;
// דפים אמיתיים (fixtures/<site>/real) נבדקים אוטומטית כשהם קיימים.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from '../scrapers/index.js';
import { openDb, strainCard } from '../db.js';
import { createHttp, scanTermsText } from '../scrapers/base.js';
import { runSource } from '../scrape.js';
import { ingestProfile } from '../ingest.js';

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (site, f) => fs.readFileSync(path.join(fx, site, f), 'utf8');
const site = (id) => SITES.find((s) => s.id === id);
const URL0 = 'https://example.test/strain/alpha';

test('cannapedia: JSON-LD + dl/dt', () => {
  const p = site('cannapedia').parseStrainPage(read('cannapedia', 'synthetic-strain.html'), URL0);
  assert.equal(p.name, 'זן בדיקה אלפא');
  assert.equal(p.producer, 'יצרן בדיקה');
  assert.equal(p.type_raw, 'היברידי');
  assert.equal(p.thc_raw, '20-24%');
  assert.equal(p.lineage_raw, 'הורה בדיקה א × הורה בדיקה ב');
  assert.deepEqual(p.effects, ['רגיעה', 'שמחה']);
  assert.deepEqual(p.indications, ['כאב כרוני', 'נדודי שינה']);
  assert.deepEqual(p.related, ['זן בדיקה בטא']);
  assert.equal(p.global_name, 'Test Strain Alpha');
  assert.equal(p.rating_raw, '4.2');
  assert.equal(p.rating_count, 12);
});

test('cannabisplus: טבלת th/td, שדות חסרים = null', () => {
  const p = site('cannabisplus').parseStrainPage(read('cannabisplus', 'synthetic-strain.html'), URL0);
  assert.equal(p.producer, 'יצרן בדיקה');
  assert.equal(p.type_raw, 'אינדיקה');
  assert.equal(p.thc_raw, '22%');
  assert.equal(p.cbd_raw, null);
  assert.equal(p.lineage_raw, null);
  assert.equal(p.effects, null);
  assert.equal(p.rating_raw, null);
});

test('cannabismonitor: ביקורות JSON-LD בסקאלה 10', () => {
  const p = site('cannabismonitor').parseStrainPage(read('cannabismonitor', 'synthetic-strain.html'), URL0);
  assert.equal(p.type_raw, 'סאטיבה');
  assert.equal(p.rating_raw, '8');
  assert.equal(p.rating_scale, 10);
  assert.equal(p.rating_count, 30);
  assert.equal(p.reviews.length, 4);
});

test('hydroshop: דף בלי נתוני זן – הכול null, שום דבר לא מומצא', () => {
  const p = site('hydroshop').parseStrainPage(read('hydroshop', 'synthetic-strain.html'), URL0);
  assert.equal(p.name, 'מוצר בדיקה');
  for (const k of ['type_raw', 'thc_raw', 'cbd_raw', 'lineage_raw', 'effects', 'indications', 'related', 'rating_raw', 'global_name']) {
    assert.equal(p[k], null, k);
  }
  assert.deepEqual(p.reviews, []);
});

test('rollup: סלקטורים ייעודיים + "תווית: ערך" + קישורי חיפוש פנימיים בלבד', () => {
  const html = read('rollup', 'synthetic-strain.html');
  const cfg = { selectors: { reviews: { item: '.review', text: '.body', rating: '.stars', positive: '.pros li', negative: '.cons li' } } };
  const p = site('rollup').parseStrainPage(html, URL0, cfg);
  assert.equal(p.producer, 'יצרן אחר');
  assert.equal(p.lineage_raw, 'הורה בדיקה א x הורה בדיקה ג');
  assert.deepEqual(p.pros, ['יתרון בדיקה']);
  assert.deepEqual(p.cons, ['חסרון בדיקה']);
  assert.equal(p.reviews[0].rating, '1');
  const links = site('rollup').parseSearchResults(html, 'https://example.test/search?q=x', { strain_url_pattern: '/strain/' });
  assert.deepEqual(links.map((l) => l.url), ['https://example.test/strain/alpha', 'https://example.test/strain/beta']);
});

test('דפים אמיתיים שמורים (אם קיימים) מתפענחים בלי שגיאה', () => {
  for (const s of SITES) {
    const realDir = path.join(fx, s.id, 'real');
    if (!fs.existsSync(realDir)) continue;
    for (const f of fs.readdirSync(realDir).filter((x) => x.endsWith('.html'))) {
      const meta = JSON.parse(fs.readFileSync(path.join(realDir, f.replace(/\.html$/, '.meta.json')), 'utf8'));
      const p = s.parseStrainPage(fs.readFileSync(path.join(realDir, f), 'utf8'), meta.url);
      const expFile = path.join(realDir, f.replace(/\.html$/, '.expected.json'));
      if (fs.existsSync(expFile)) assert.deepEqual(p, JSON.parse(fs.readFileSync(expFile, 'utf8')));
      else assert.ok(p.name, `${s.id}/${f}: לא חולץ שם`);
    }
  }
});

test('אימות הצלבה: שני מקורות סותרים בסוג – שניהם נשמרים ומסומנים conflict', () => {
  const db = openDb(':memory:');
  for (const id of ['cannapedia', 'cannabisplus']) db.prepare('INSERT INTO sources (id, name) VALUES (?, ?)').run(id, id);
  const a = site('cannapedia').parseStrainPage(read('cannapedia', 'synthetic-strain.html'), 'https://a.test/1');
  const b = site('cannabisplus').parseStrainPage(read('cannabisplus', 'synthetic-strain.html'), 'https://b.test/1');
  const r1 = ingestProfile(db, 'cannapedia', a, '2026-10-08T00:00:00Z');
  const r2 = ingestProfile(db, 'cannabisplus', b, '2026-10-08T00:01:00Z');
  assert.equal(r1.strainId, r2.strainId);
  assert.ok(r2.conflicts.includes('type'));
  const card = strainCard(db, r1.strainId);
  assert.deepEqual(card.fields.type.map((t) => [t.value, t.validation, t.source_url]).sort(), [
    ['hybrid', 'conflict', 'https://a.test/1'],
    ['indica', 'conflict', 'https://b.test/1'],
  ]);
  assert.equal(card.fields.thc.every((t) => t.validation === 'agree'), true); // 22 מול 22
  assert.equal(card.fields.cbd.length, 1); // רק מקור אחד נתן CBD
  assert.equal(card.aliases[0].global_name, 'Test Strain Alpha'); // שם גלובלי רק כי המקור קבע
});

test('ביקורות: מסווגות רק לפי ציון, מקוצרות, עם קישור', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO sources (id, name) VALUES ('cannabismonitor', 'm')").run();
  const p = site('cannabismonitor').parseStrainPage(read('cannabismonitor', 'synthetic-strain.html'), URL0);
  const { strainId } = ingestProfile(db, 'cannabismonitor', p, '2026-10-08T00:00:00Z');
  const card = strainCard(db, strainId);
  assert.equal(card.reviews.positive.length, 1);
  assert.equal(card.reviews.negative.length, 1); // הניטרלית ובלי-ציון לא נכנסו
  assert.ok(card.reviews.positive[0].excerpt.length <= 201);
  assert.equal(card.reviews.positive[0].source_url, URL0);
  assert.equal(card.rating.combined, 4);
  assert.equal(card.rating.count, 30);
});

// --- robots.txt ותנאי שימוש, עם fetch מדומה (בלי רשת) ---
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (r instanceof Error) throw r;
    return { status: r ? r.status ?? 200 : 404, text: async () => (r ? r.body ?? '' : '') };
  };
  fn.calls = calls;
  return fn;
}
const noSleep = async () => {};

test('robots.txt שאוסר הכול → המקור נחסם ולא נשלפים דפים', async () => {
  const db = openDb(':memory:');
  const f = fakeFetch({ 'https://s.test/robots.txt': { body: 'User-agent: *\nDisallow: /' } });
  const r = await runSource(db, createHttp(db, { fetchImpl: f, sleep: noSleep }), site('cannapedia'),
    { base_url: 'https://s.test', tos_status: 'allowed', seed_urls: ['https://s.test/strain/a'] });
  assert.equal(r.status, 'blocked');
  assert.deepEqual(f.calls, ['https://s.test/robots.txt']);
});

test('תנאי שימוש שלא נבדקו ידנית → לא אוספים, ומדווחים ביטויים חשודים', async () => {
  const db = openDb(':memory:');
  const f = fakeFetch({
    'https://s.test/robots.txt': { body: 'User-agent: *\nAllow: /' },
    'https://s.test/terms': { body: '<p>אסור להעתיק תוכן מהאתר.</p><p>שימוש בסורק אוטומטי אסור.</p>' },
  });
  const r = await runSource(db, createHttp(db, { fetchImpl: f, sleep: noSleep }), site('cannabisplus'),
    { base_url: 'https://s.test', tos_url: 'https://s.test/terms', tos_status: 'unreviewed', seed_urls: ['https://s.test/strain/a'] });
  assert.equal(r.status, 'blocked');
  assert.match(r.message, /ביטויים חשודים/);
  assert.ok(!f.calls.includes('https://s.test/strain/a'));
  assert.equal(scanTermsText('Scraping is prohibited.').length, 1);
});

test('מקור מאושר: מכבד Disallow לנתיב, אוסף ושומר עם מקור ותאריך, ומשתמש ב-cache', async () => {
  const db = openDb(':memory:');
  const page = read('cannapedia', 'synthetic-strain.html');
  const f = fakeFetch({
    'https://s.test/robots.txt': { body: 'User-agent: *\nDisallow: /private/' },
    'https://s.test/strain/a': { body: page },
    'https://s.test/private/b': { body: page },
  });
  const http = createHttp(db, { fetchImpl: f, sleep: noSleep });
  const cfg = { base_url: 'https://s.test', tos_status: 'allowed', seed_urls: ['https://s.test/strain/a', 'https://s.test/private/b'] };
  const r = await runSource(db, http, site('cannapedia'), cfg);
  assert.equal(r.status, 'ok');
  assert.equal(r.strains, 1);
  assert.ok(!f.calls.includes('https://s.test/private/b'));
  const fact = db.prepare("SELECT * FROM strain_facts WHERE field = 'type'").get();
  assert.equal(fact.source_url, 'https://s.test/strain/a');
  assert.ok(fact.fetched_at);
  await runSource(db, http, site('cannapedia'), cfg);
  assert.equal(f.calls.filter((u) => u === 'https://s.test/strain/a').length, 1); // פעם שנייה מה-cache
});

test('מקור בלי כתובת מוגדרת מדולג', async () => {
  const db = openDb(':memory:');
  const r = await runSource(db, createHttp(db, { fetchImpl: fakeFetch({}) }), site('rollup'), { base_url: null });
  assert.equal(r.status, 'skipped');
});
