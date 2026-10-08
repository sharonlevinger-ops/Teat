// פענוח תפריט PDF של בית מרקחת לרשימת תפרחות.
// לא מסתמכים על סדר הטקסט שה-PDF מחזיר (הוא מתערבב בעברית); במקום זה
// משתמשים במיקום x/y ובגובה הגופן של כל פריט טקסט:
//   - עמודות מזוהות לפי מיקום סימן ₪ (תמיד בקצה השמאלי של כל שורה).
//   - בתוך עמודה, פריטים בעלי y קרוב = שורה אחת.
//   - כותרת קטגוריה (T22/C4) בגופן גדול, ואחריה שורת סוג (סאטיבה/אינדיקה/הייבריד).
//   - בשורת מוצר: גופן בינוני = שם הזן, גופן קטן = יצרן, המספר שליד ₪ = מחיר בפועל.
// הקטגוריה והסוג "זורמים" מעמודה לעמודה ומעמוד לעמוד (ימין→שמאל), כמו בקריאה.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const CATEGORY_RE = /^T\d+\s*\/\s*C\d+$/i;
const TYPE_WORDS = [
  [/סאטיב/, 'sativa'],
  [/אינדיק/, 'indica'],
  [/היי?בריד/, 'hybrid'],
];
const PRICE_RE = /^\d{1,4}(?:[.,]\d{1,2})?$/;
const ROW_TOLERANCE = 4; // נקודות PDF
const BADGE_MAX_HEIGHT = 5; // תגיות כמו "חדש" קטנות מאוד

export async function extractItems(data) {
  const task = getDocument({ data: new Uint8Array(data), verbosity: 0, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { height } = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      const str = it.str.replace(/[​-‏‪-‮]/g, '');
      if (!str.trim()) continue;
      const [, , , d, e, f] = it.transform;
      items.push({ str, x: e, right: e + it.width, y: height - f, h: Math.abs(d), font: it.fontName });
    }
    pages.push({ number: p, height, items });
  }
  await task.destroy();
  return pages;
}

function typeOf(str) {
  for (const [re, t] of TYPE_WORDS) if (re.test(str)) return t;
  return null;
}

// מחבר פריטי טקסט של אותה שורה לפי סדר קריאה מימין לשמאל.
// רווח נוסף רק כשיש מרווח פיזי בין הפריטים (גרש/מקף צמודים לא מקבלים רווח).
function joinRtl(items) {
  const sorted = [...items].sort((a, b) => b.right - a.right);
  let out = '';
  let prev = null;
  for (const raw of sorted) {
    const it = { ...raw, str: visualToLogical(raw.str) };
    if (prev) {
      const gap = prev.x - it.right;
      if (gap > Math.max(0.8, it.h * 0.15)) out += ' ';
    }
    out += it.str;
    prev = it;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// פריט LTR בתוך שורה עברית מגיע בסדר ויזואלי. פריט שכולו פיסוק (למשל ".'")
// מתהפך, ומקף שצמוד ויזואלית לטקסט העברי ("601-") עובר לתחילת המחרוזת.
function visualToLogical(str) {
  if (/^[^\p{L}\p{N}\s]{2,}$/u.test(str)) return [...str].reverse().join('');
  const m = str.match(/^([\p{N}A-Za-z.]+)-$/u);
  if (m) return `-${m[1]}`;
  return str;
}

// הערת קטגוריה בתוך שם המוצר ("דליה אדומה T22C4") אינה חלק משם הזן
const NAME_CATEGORY_RE = /\s*\bT\d+\s*\/?\s*C\d+\b\s*/gi;
export function cleanName(name) {
  return name.replace(NAME_CATEGORY_RE, ' ').replace(/\s+/g, ' ').trim();
}

function clusterColumns(xs) {
  const sorted = [...new Set(xs.map((x) => Math.round(x)))].sort((a, b) => a - b);
  const clusters = [];
  for (const x of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.max < 40) last.max = x;
    else clusters.push({ min: x, max: x });
  }
  return clusters;
}

function groupRows(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.y - row.y) <= ROW_TOLERANCE) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows;
}

function parsePrice(s) {
  return Number(s.replace(',', '.'));
}

function parseRow(items) {
  const shekel = items.find((i) => i.str.trim() === '₪' || i.str.includes('₪'));
  if (!shekel) return null;
  const numbers = items.filter((i) => PRICE_RE.test(i.str.trim()));
  // המחיר בפועל = המספר הקרוב ביותר מימין לסימן ₪
  const sale = numbers
    .filter((i) => i.x >= shekel.x - 1)
    .sort((a, b) => a.x - b.x)[0];
  if (!sale) return null;
  const original = numbers.filter((i) => i !== sale && i.x > sale.x).sort((a, b) => a.x - b.x)[0] || null;
  const priceZoneRight = Math.max(sale.right, original ? original.right : 0);
  const text = items.filter((i) => i !== shekel && i !== sale && i !== original && i.x > priceZoneRight - 0.5);
  if (!text.length) return null;
  const maxH = Math.max(...text.map((i) => i.h));
  const nameItems = text.filter((i) => i.h >= maxH - 0.6);
  const producerItems = text.filter((i) => i.h < maxH - 0.6);
  return {
    name: joinRtl(nameItems),
    producer: producerItems.length ? joinRtl(producerItems).replace(/…$/, '').trim() : null,
    price_ils: parsePrice(sale.str),
    original_price_ils: original ? parsePrice(original.str) : null,
    truncated_producer: producerItems.some((i) => i.str.includes('…')),
  };
}

function pageMeta(items) {
  const titleItems = items.filter((i) => i.h >= 14);
  const title = joinRtl(titleItems.filter((i) => !/\d{1,2}\/\d{1,2}\/\d{4}/.test(i.str)));
  const dateItem = items.find((i) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(i.str) && i.h >= 14);
  const date = dateItem ? dateItem.str.match(/\d{1,2}\/\d{1,2}\/\d{4}/)[0] : null;
  const footer = items.find((i) => /עמוד\s*\d+\s*מתוך\s*\d+/.test(i.str));
  return { title, date, footerY: footer ? footer.y : null };
}

function storeMeta(pages) {
  // שם בית המרקחת ועיר מופיעים בפינה הימנית העליונה של העמוד הראשון
  const first = pages[0]?.items || [];
  const top = first.filter((i) => i.y < 80 && i.x > 400 && !/\d/.test(i.str));
  const byY = [...top].sort((a, b) => a.y - b.y);
  const store = byY[0]?.str?.trim() || null;
  const cityItem = byY.find((i) => i !== byY[0] && i.h < byY[0].h);
  return { store, city: cityItem ? cityItem.str.trim() : null };
}

/**
 * @param {Buffer|Uint8Array} data
 * @returns {Promise<{store, city, date, source, items: Array}>}
 */
export async function parseMenuPdf(data) {
  const pages = await extractItems(data);
  const { store, city } = storeMeta(pages);
  const results = [];
  let category = null;
  let type = null;
  let menuDate = null;

  for (const page of pages) {
    const meta = pageMeta(page.items);
    menuDate = menuDate || meta.date;
    // רק עמודי "תפרחות" – עמודי שמנים/גליליות וכד' מדולגים
    if (!/תפרחות/.test(meta.title)) continue;
    const titleY = Math.max(0, ...page.items.filter((i) => i.h >= 14).map((i) => i.y));
    const bottom = meta.footerY ?? page.height;
    const body = page.items.filter((i) => i.y > titleY + 2 && i.y < bottom - 2 && i.h > BADGE_MAX_HEIGHT);

    const shekels = body.filter((i) => i.str.includes('₪'));
    if (!shekels.length) continue;
    const cols = clusterColumns(shekels.map((i) => i.x)).sort((a, b) => b.min - a.min); // ימין→שמאל
    const bounds = cols.map((c, idx) => ({ min: c.min - 12, max: idx === 0 ? Infinity : cols[idx - 1].min - 12 }));

    for (const b of bounds) {
      const colItems = body.filter((i) => i.x >= b.min && i.x < b.max);
      for (const row of groupRows(colItems)) {
        const joined = joinRtl(row.items);
        const hasPrice = row.items.some((i) => i.str.includes('₪'));
        if (!hasPrice) {
          const big = row.items.filter((i) => i.h >= 10);
          const catItem = big.find((i) => CATEGORY_RE.test(i.str.trim()));
          if (catItem) {
            category = catItem.str.replace(/\s+/g, '').toUpperCase();
            type = null;
          }
          const t = typeOf(joined);
          if (t && row.items.every((i) => !PRICE_RE.test(i.str.trim()))) type = t;
          continue;
        }
        const parsed = parseRow(row.items);
        if (!parsed || !parsed.name) continue;
        const name = cleanName(parsed.name);
        results.push({
          name,
          ...(name !== parsed.name ? { name_raw: parsed.name } : {}),
          producer: parsed.producer,
          price_ils: parsed.price_ils,
          original_price_ils: parsed.original_price_ils,
          category,
          type,
          page: page.number,
          ...(parsed.truncated_producer ? { producer_truncated: true } : {}),
        });
      }
    }
  }

  const source = [ [store, city].filter(Boolean).join(' '), menuDate ? `תפריט ${menuDate}` : null ]
    .filter(Boolean)
    .join(', ');
  return {
    store,
    city,
    date: menuDate,
    source,
    items: results.map((r) => ({ ...r, source })),
  };
}
