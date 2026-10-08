// תשתית משותפת לכל ה-scrapers: בדיקת robots.txt, שער תנאי שימוש,
// הגבלת קצב לכל דומיין ומטמון HTTP במסד הנתונים.
import robotsParser from 'robots-parser';
import { log, updateSourceStatus } from '../db.js';

export const USER_AGENT = 'CannabisReviewsBot/0.1 (+personal research; contact: site owner)';
const DEFAULT_DELAY_MS = 4000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

// מילים בתנאי שימוש שמעידות על איסור איסוף אוטומטי – מסמנות לבדיקה ידנית
const TOS_RED_FLAGS = [
  /איסוף\s+(?:אוטומטי|מידע|נתונים)/,
  /אין\s+להעתיק/,
  /אסור\s+(?:להעתיק|לאסוף|לשכפל)/,
  /כריית\s+(?:מידע|נתונים)/,
  /רובוט|זחלן|סורק/,
  /scrap(?:e|ing)/i,
  /crawl(?:er|ing)?/i,
  /spider/i,
  /data\s+mining/i,
  /automated\s+(?:means|access|collection)/i,
];

export class ScrapeBlocked extends Error {
  constructor(reason, detail) {
    super(detail || reason);
    this.reason = reason;
  }
}

export function createHttp(db, { fetchImpl = globalThis.fetch, delayMs = DEFAULT_DELAY_MS, sleep } = {}) {
  const lastHit = new Map();
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function get(url, { useCache = true } = {}) {
    if (useCache) {
      const c = db.prepare('SELECT * FROM http_cache WHERE url = ?').get(url);
      if (c && Date.now() - Date.parse(c.fetched_at) < CACHE_TTL_MS) {
        return { status: c.status, body: c.body, fetchedAt: c.fetched_at, url, cached: true };
      }
    }
    const host = new URL(url).host;
    const since = Date.now() - (lastHit.get(host) || 0);
    if (since < delayMs) await wait(delayMs - since);
    lastHit.set(host, Date.now());
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5' },
      redirect: 'follow',
    });
    const body = await res.text();
    const fetchedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO http_cache (url, status, body, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET status=excluded.status, body=excluded.body, fetched_at=excluded.fetched_at`,
    ).run(url, res.status, body, fetchedAt);
    return { status: res.status, body, fetchedAt, url, cached: false };
  }

  return { get, setDelay: (ms) => (delayMs = ms) };
}

/**
 * בודק robots.txt. מחזיר אובייקט עם isAllowed(url) ו-crawlDelay.
 * אם robots.txt לא נגיש (שגיאת רשת) – לא אוספים (עדיף להיזהר).
 * 404 ל-robots.txt = אין הגבלות לפי התקן.
 */
export async function checkRobots(db, http, source) {
  const robotsUrl = new URL('/robots.txt', source.base_url).href;
  let res;
  try {
    res = await http.get(robotsUrl, { useCache: false });
  } catch (e) {
    updateSourceStatus(db, source.id, { robots_status: 'unreachable', robots_checked_at: new Date().toISOString() });
    throw new ScrapeBlocked('robots_unreachable', `robots.txt לא נגיש: ${e.cause?.code || e.message}`);
  }
  if (res.status >= 500) {
    updateSourceStatus(db, source.id, { robots_status: 'unreachable', robots_checked_at: res.fetchedAt });
    throw new ScrapeBlocked('robots_unreachable', `robots.txt החזיר ${res.status}`);
  }
  const robots = robotsParser(robotsUrl, res.status === 200 ? res.body : '');
  const rootAllowed = robots.isAllowed(new URL('/', source.base_url).href, USER_AGENT) !== false;
  updateSourceStatus(db, source.id, {
    robots_status: rootAllowed ? 'allowed' : 'disallowed',
    robots_checked_at: res.fetchedAt,
  });
  return {
    isAllowed: (url) => robots.isAllowed(url, USER_AGENT) !== false,
    crawlDelayMs: (robots.getCrawlDelay(USER_AGENT) || 0) * 1000,
    rootAllowed,
  };
}

/** סורק את דף תנאי השימוש ומחזיר את המשפטים החשודים (לבדיקה של אדם) */
export function scanTermsText(text) {
  const sentences = String(text)
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.filter((s) => TOS_RED_FLAGS.some((re) => re.test(s))).slice(0, 10);
}

/**
 * שער תנאי שימוש: איסוף מותר רק אם אדם קרא את התנאים וסימן
 * tos_status: "allowed" בקובץ sources.json. אם יש סימני איסור בטקסט –
 * מדווחים גם כשהסימון "allowed", כדי שתבדוק שוב.
 */
export async function checkTerms(db, http, source) {
  let flagged = [];
  if (source.tos_url) {
    try {
      const res = await http.get(source.tos_url);
      if (res.status === 200) flagged = scanTermsText(res.body);
    } catch (e) {
      log(db, source.id, 'warn', `דף תנאי השימוש לא נגיש: ${e.message}`);
    }
  }
  const status = source.tos_status || 'unreviewed';
  updateSourceStatus(db, source.id, {
    tos_status: status,
    tos_note: flagged.length ? `ביטויים לבדיקה: ${flagged.join(' | ').slice(0, 900)}` : source.tos_note || null,
  });
  if (status === 'forbidden') throw new ScrapeBlocked('tos_forbidden', 'תנאי השימוש אוסרים איסוף');
  if (status !== 'allowed') {
    throw new ScrapeBlocked(
      'tos_unreviewed',
      `תנאי השימוש לא נבדקו ידנית${flagged.length ? ` (נמצאו ${flagged.length} ביטויים חשודים)` : ''}`,
    );
  }
  return { flagged };
}
