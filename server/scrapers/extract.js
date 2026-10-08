// חילוץ גנרי מדף זן. סדר עדיפויות:
//   1. סלקטורים ספציפיים לאתר (אם הוגדרו בקובץ האתר)
//   2. נתונים מובנים JSON-LD (schema.org Product / Review / AggregateRating)
//   3. תוויות טקסט מוכרות בעברית/אנגלית ("סוג:", "THC", "הורים" ...)
// כל מה שלא נמצא מוחזר null. שום ערך לא "מושלם" מהדמיון.
import * as cheerio from 'cheerio';
import { parseList } from '../normalize.js';

const LABELS = {
  type: [/^סוג(?:\s+(?:הזן|צמח))?$/, /^זן$/, /^type$/i, /^strain type$/i],
  thc: [/^(?:אחוז\s+)?thc$/i, /^ריכוז\s+thc$/i],
  cbd: [/^(?:אחוז\s+)?cbd$/i, /^ריכוז\s+cbd$/i],
  producer: [/^יצרן$/, /^מגדל$/, /^חברה$/, /^producer$/i, /^brand$/i, /^grower$/i],
  lineage: [/^הורים$/, /^שושלת$/, /^גנטיקה$/, /^הכלאה$/, /^lineage$/i, /^genetics$/i, /^parents$/i],
  effects: [/^השפעות?$/, /^אפקטים$/, /^effects$/i],
  indications: [/^התוויות?$/, /^מתאים\s+ל/, /^שימושים\s+רפואיים$/, /^medical(?:\s+uses)?$/i, /^helps\s+with$/i],
  related: [/^זנים\s+(?:קרובים|דומים)$/, /^similar\s+strains$/i, /^related\s+strains$/i],
  global_name: [/^שם\s+(?:גלובלי|מקורי|בינלאומי)$/, /^ידוע\s+(?:גם\s+)?בשם$/, /^also\s+known\s+as$/i, /^aka$/i, /^original\s+name$/i],
  name_en: [/^שם\s+(?:באנגלית|לועזי)$/, /^english\s+name$/i],
  rating: [/^דירוג$/, /^ציון$/, /^rating$/i],
};

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim() || null;
}

function jsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.shift();
        if (!n || typeof n !== 'object') continue;
        out.push(n);
        if (n['@graph']) stack.push(...n['@graph']);
      }
    } catch {
      /* JSON-LD פגום – מתעלמים */
    }
  });
  return out;
}

/** מוצא ערך לפי תווית: <dt>/<th>/<strong>/"תווית: ערך" */
function byLabel($, patterns) {
  const matches = (t) => {
    const s = clean(t)?.replace(/[:：]\s*$/, '');
    return s && patterns.some((re) => re.test(s));
  };
  let found = null;
  $('dt, th, strong, b, .label, [class*="label"], span, li, p, td').each((_, el) => {
    if (found) return;
    const $el = $(el);
    const own = $el.clone().children().remove().end().text();
    // "תווית: ערך" באותו אלמנט
    const inline = clean($el.text())?.match(/^([^:：]{1,30})[:：]\s*(.+)$/);
    if (inline && matches(inline[1])) {
      found = inline[2];
      return;
    }
    if (!matches(own) && !matches($el.text())) return;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'dt') found = $el.next('dd').text();
    else if (tag === 'th') found = $el.next('td').text() || $el.parent().next().find('td').first().text();
    else {
      const next = $el.next();
      found = next.length ? next.text() : $el.parent().clone().children().first().remove().end().text();
    }
  });
  return clean(found);
}

function listByLabel($, patterns) {
  // רשימות: מעדיפים <ul>/<li> שאחרי הכותרת
  let items = null;
  $('h2, h3, h4, dt, strong, th').each((_, el) => {
    if (items) return;
    const t = clean($(el).text())?.replace(/[:：]\s*$/, '');
    if (!t || !patterns.some((re) => re.test(t))) return;
    const list = $(el).nextAll('ul, ol').first();
    if (list.length) items = list.find('li').map((__, li) => clean($(li).text())).get();
    else if ($(el).is('dt')) items = parseList($(el).next('dd').text());
  });
  if (items?.length) return parseList(items);
  return parseList(byLabel($, patterns));
}

/**
 * @param {string} html
 * @param {string} url
 * @param {object} [selectors] סלקטורים ספציפיים לאתר: { name, producer, type, thc, cbd,
 *   lineage, effects, indications, related, rating, ratingCount, reviews: {item, text, rating, positive, negative} }
 */
export function extractStrainPage(html, url, selectors = {}) {
  const $ = cheerio.load(html);
  const sel = (key) => (selectors[key] ? clean($(selectors[key]).first().text()) : null);
  const selList = (key) =>
    selectors[key] ? parseList($(selectors[key]).map((_, el) => clean($(el).text())).get()) : null;

  const ld = jsonLd($);
  const product = ld.find((n) => /Product|Thing|CreativeWork/.test([].concat(n['@type']).join(' ')) && n.name);
  const agg = ld.map((n) => n.aggregateRating).find(Boolean) || ld.find((n) => n['@type'] === 'AggregateRating');
  const ldReviews = ld.flatMap((n) => [].concat(n.review || [])).concat(ld.filter((n) => n['@type'] === 'Review'));

  const name =
    sel('name') ||
    clean(product?.name) ||
    clean($('h1').first().text()) ||
    clean($('meta[property="og:title"]').attr('content'));

  const ratingRaw = sel('rating') ?? (agg ? clean(agg.ratingValue) : null) ?? byLabel($, LABELS.rating);
  const ratingScale = agg?.bestRating ? Number(agg.bestRating) : selectors.ratingScale || 5;
  const countRaw = sel('ratingCount') ?? (agg ? clean(agg.ratingCount ?? agg.reviewCount) : null);

  // ביקורות: חיובית/שלילית נקבעת רק לפי ציון שהמקור נתן, או לפי אזור
  // "יתרונות"/"חסרונות" מפורש באתר – לא לפי ניחוש של הטקסט.
  const reviews = [];
  for (const r of ldReviews) {
    const text = clean(r.reviewBody || r.description);
    const rv = r.reviewRating?.ratingValue;
    const best = Number(r.reviewRating?.bestRating) || 5;
    if (text) reviews.push({ text, rating: rv ?? null, scale: best });
  }
  if (selectors.reviews?.item) {
    $(selectors.reviews.item).each((_, el) => {
      const $r = $(el);
      const text = clean(selectors.reviews.text ? $r.find(selectors.reviews.text).text() : $r.text());
      const rt = selectors.reviews.rating ? clean($r.find(selectors.reviews.rating).attr('data-rating') || $r.find(selectors.reviews.rating).text()) : null;
      if (text) reviews.push({ text, rating: rt, scale: selectors.ratingScale || 5 });
    });
  }
  const pros = selectors.reviews?.positive ? $(selectors.reviews.positive).map((_, el) => clean($(el).text())).get() : [];
  const cons = selectors.reviews?.negative ? $(selectors.reviews.negative).map((_, el) => clean($(el).text())).get() : [];

  return {
    url,
    name,
    name_en: sel('name_en') || byLabel($, LABELS.name_en),
    producer: sel('producer') || clean(product?.brand?.name || product?.brand || product?.manufacturer?.name) || byLabel($, LABELS.producer),
    type_raw: sel('type') || byLabel($, LABELS.type),
    thc_raw: sel('thc') || byLabel($, LABELS.thc),
    cbd_raw: sel('cbd') || byLabel($, LABELS.cbd),
    lineage_raw: sel('lineage') || byLabel($, LABELS.lineage),
    effects: selList('effects') || listByLabel($, LABELS.effects),
    indications: selList('indications') || listByLabel($, LABELS.indications),
    related: selList('related') || listByLabel($, LABELS.related),
    global_name: sel('global_name') || byLabel($, LABELS.global_name),
    rating_raw: ratingRaw,
    rating_scale: ratingScale,
    rating_count: countRaw ? Number(String(countRaw).replace(/\D/g, '')) || null : null,
    reviews,
    pros: pros.filter(Boolean),
    cons: cons.filter(Boolean),
  };
}

/** רשימת קישורים מדף תוצאות חיפוש. linkSelector ספציפי לאתר, אחרת כל קישור פנימי עם טקסט */
export function extractSearchResults(html, pageUrl, linkSelector = 'a[href]') {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const out = new Map();
  $(linkSelector).each((_, a) => {
    const href = $(a).attr('href');
    const title = clean($(a).text()) || clean($(a).attr('title'));
    if (!href || !title) return;
    let abs;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (abs.host !== base.host) return;
    abs.hash = '';
    if (!out.has(abs.href)) out.set(abs.href, { url: abs.href, title });
  });
  return [...out.values()];
}
