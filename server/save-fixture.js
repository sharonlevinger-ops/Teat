// שמירת דף אמיתי כ-fixture לבדיקות: npm run save-fixture -- <site> <url>
// מכבד robots.txt. הדף נשמר ב-server/test/fixtures/<site>/real/ לצד קובץ .meta.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import robotsParser from 'robots-parser';
import { USER_AGENT } from './scrapers/base.js';

const [site, url] = process.argv.slice(2);
if (!site || !url) {
  console.error('שימוש: npm run save-fixture -- <site> <url>');
  process.exit(1);
}
const robotsUrl = new URL('/robots.txt', url).href;
const rr = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT } });
const robots = robotsParser(robotsUrl, rr.ok ? await rr.text() : '');
if (robots.isAllowed(url, USER_AGENT) === false) {
  console.error('robots.txt אוסר את הכתובת הזו – לא נשמר');
  process.exit(2);
}
const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
const html = await res.text();
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test', 'fixtures', site, 'real');
fs.mkdirSync(dir, { recursive: true });
const name = new URL(url).pathname.replace(/[^\w֐-׿-]+/g, '_').replace(/^_|_$/g, '') || 'index';
fs.writeFileSync(path.join(dir, `${name}.html`), html);
fs.writeFileSync(path.join(dir, `${name}.meta.json`), JSON.stringify({ url, status: res.status, fetched_at: new Date().toISOString() }, null, 1));
console.log(`נשמר: ${path.join(dir, name)}.html (${res.status})`);
