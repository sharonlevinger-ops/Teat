// הרצת איסוף: npm run scrape   |   בדיקת robots/תנאי שימוש בלבד: npm run check-sources
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, upsertSource, updateSourceStatus, listSources, log } from './db.js';
import { createHttp, checkRobots, checkTerms, ScrapeBlocked } from './scrapers/base.js';
import { ingestProfile } from './ingest.js';
import { searchKey } from './normalize.js';
import { SITES } from './scrapers/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadSourceConfig(file = path.join(here, 'sources.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).sources;
}

/** מריץ מקור אחד. מחזיר דוח { id, status, message, pages, strains } */
export async function runSource(db, http, site, config, { checkOnly = false, limit = 50 } = {}) {
  const report = { id: site.id, name: site.name, status: 'ok', message: '', pages: 0, strains: 0, conflicts: [] };
  upsertSource(db, { id: site.id, name: site.name, base_url: config.base_url, tos_url: config.tos_url });
  const finish = (status, message) => {
    Object.assign(report, { status, message });
    updateSourceStatus(db, site.id, { last_run_at: new Date().toISOString(), last_run_status: `${status}: ${message}` });
    log(db, site.id, status === 'ok' ? 'info' : 'warn', message);
    return report;
  };
  if (!config.base_url) return finish('skipped', 'לא הוגדרה כתובת אתר (base_url) – לא נאסף דבר');

  let robots;
  try {
    robots = await checkRobots(db, http, { ...config, id: site.id });
    if (!robots.rootAllowed) return finish('blocked', 'robots.txt אוסר גישה לאתר – לא נאסף דבר');
    if (robots.crawlDelayMs) http.setDelay(Math.max(robots.crawlDelayMs, 4000));
    await checkTerms(db, http, { ...config, id: site.id });
  } catch (e) {
    if (e instanceof ScrapeBlocked) return finish('blocked', e.message);
    return finish('error', e.message);
  }
  if (checkOnly) return finish('ok', 'robots.txt ותנאי שימוש מאפשרים איסוף');

  // מה לאסוף: דפי seed מוגדרים + חיפוש לפי זנים שמופיעים בתפריטים שהועלו
  const targets = new Map();
  for (const u of config.seed_urls || []) targets.set(u, null);
  const wanted = db.prepare('SELECT DISTINCT search_key, name FROM menu_items ORDER BY id DESC LIMIT ?').all(limit);
  for (const w of wanted) {
    for (const searchUrl of site.searchUrls(config, w.search_key)) {
      if (!robots.isAllowed(searchUrl)) continue;
      try {
        const res = await http.get(searchUrl);
        report.pages++;
        if (res.status !== 200) continue;
        for (const link of site.parseSearchResults(res.body, searchUrl, config).slice(0, 5)) {
          // מקבלים רק תוצאה ששמה זהה לשם המבוקש (אחרי נרמול) – בלי ניחושים
          if (searchKey(link.title) === w.search_key) targets.set(link.url, w.search_key);
        }
      } catch (e) {
        log(db, site.id, 'warn', `חיפוש נכשל ${searchUrl}: ${e.message}`);
      }
    }
  }

  for (const [url, expectedKey] of targets) {
    if (!robots.isAllowed(url)) {
      log(db, site.id, 'info', `דולג (robots.txt): ${url}`);
      continue;
    }
    try {
      const res = await http.get(url);
      report.pages++;
      if (res.status !== 200) continue;
      const profile = site.parseStrainPage(res.body, url, config);
      if (expectedKey && searchKey(profile.name) !== expectedKey) continue;
      const r = ingestProfile(db, site.id, profile, res.fetchedAt);
      if (r) {
        report.strains++;
        if (r.conflicts.length) report.conflicts.push({ url, fields: r.conflicts });
      }
    } catch (e) {
      log(db, site.id, 'warn', `דף נכשל ${url}: ${e.message}`);
    }
  }
  return finish('ok', `נאספו ${report.strains} זנים מ-${report.pages} דפים`);
}

export async function runAll(db, { checkOnly = false, http = createHttp(db) } = {}) {
  const configs = loadSourceConfig();
  const reports = [];
  for (const site of SITES) {
    const config = configs.find((c) => c.id === site.id) || { id: site.id };
    reports.push(await runSource(db, http, site, config, { checkOnly }));
  }
  return reports;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  const reports = await runAll(db, { checkOnly: process.argv.includes('--check-only') });
  console.log('\nדוח מקורות:');
  for (const r of reports) console.log(`- ${r.name} [${r.status}] ${r.message}`);
  const conflicts = reports.flatMap((r) => r.conflicts.map((c) => `${r.name}: ${c.url} (${c.fields.join(', ')})`));
  if (conflicts.length) console.log('\nסתירות בין מקורות (נשמרו שני הערכים):\n' + conflicts.join('\n'));
  console.log('\nמצב שמור במסד:', listSources(db).map((s) => `${s.id}=${s.robots_status}/${s.tos_status}`).join(' '));
}
