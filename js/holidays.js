// Israeli Jewish holidays & memorial days, computed from the Hebrew calendar
// using the built-in Intl Hebrew calendar (no external data, works offline).

const fmtParts = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtHe = new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long', day: 'numeric' });

function normMonth(name) {
  const n = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (n.startsWith('adar ii') || n === 'adar 2') return 'adar2';
  if (n.startsWith('adar i') || n === 'adar 1') return 'adar1';
  if (n.startsWith('adar')) return 'adar';
  if (n.startsWith('tish')) return 'tishri';
  if (n.startsWith('hesh') || n.startsWith('chesh') || n.startsWith('mar')) return 'heshvan';
  if (n.startsWith('kis')) return 'kislev';
  if (n.startsWith('tev')) return 'tevet';
  if (n.startsWith('she') || n.startsWith('shv')) return 'shevat';
  if (n.startsWith('nis')) return 'nisan';
  if (n.startsWith('iy')) return 'iyar';
  if (n.startsWith('siv')) return 'sivan';
  if (n.startsWith('tam')) return 'tamuz';
  if (n.startsWith('av')) return 'av';
  if (n.startsWith('el')) return 'elul';
  return n;
}

const cache = new Map();
/** Hebrew date of a JS Date → { day, month, year } */
export function hebrewDate(date) {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (cache.has(key)) return cache.get(key);
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const parts = fmtParts.formatToParts(noon);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const res = { day: parseInt(get('day'), 10), month: normMonth(get('month')), year: parseInt(get('year'), 10) };
  cache.set(key, res);
  return res;
}

/** Hebrew-language Hebrew date label, e.g. "כ״ה בכסלו" */
export function hebrewDateLabel(date) {
  try { return fmtHe.format(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)); } catch { return ''; }
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Returns a list of holidays for the date: [{ name, type }]
 * type: 'chag' (holiday), 'erev' (eve), 'moed' (Chol HaMoed), 'memorial', 'fast', 'minor'
 */
export function holidaysFor(date) {
  const h = hebrewDate(date);
  const dow = date.getDay(); // 0=Sun .. 6=Sat
  const { day: d, month: m } = h;
  const out = [];
  const add = (name, type = 'minor') => out.push({ name, type });

  // Purim month: Adar in regular years, Adar II in leap years
  const purimMonth = m === 'adar' || m === 'adar2';

  switch (m) {
    case 'elul':
      if (d === 29) add('ערב ראש השנה', 'erev');
      break;
    case 'tishri':
      if (d === 1 || d === 2) add('ראש השנה', 'chag');
      if ((d === 3 && dow !== 6) || (d === 4 && dow === 0)) add('צום גדליה', 'fast');
      if (d === 9) add('ערב יום כיפור', 'erev');
      if (d === 10) add('יום כיפור', 'chag');
      if (d === 14) add('ערב סוכות', 'erev');
      if (d === 15) add('סוכות', 'chag');
      if (d >= 16 && d <= 20) add('חול המועד סוכות', 'moed');
      if (d === 21) add('הושענא רבה', 'moed');
      if (d === 22) add('שמיני עצרת · שמחת תורה', 'chag');
      break;
    case 'tevet':
      if (d === 10) add('עשרה בטבת', 'fast');
      break;
    case 'shevat':
      if (d === 15) add('ט״ו בשבט', 'minor');
      break;
    case 'nisan':
      if ((d === 27 && dow !== 5 && dow !== 0) || (d === 26 && dow === 4) || (d === 28 && dow === 1)) add('יום השואה', 'memorial');
      if (d === 14) add('ערב פסח', 'erev');
      if (d === 15) add('פסח', 'chag');
      if (d >= 16 && d <= 20) add('חול המועד פסח', 'moed');
      if (d === 21) add('שביעי של פסח', 'chag');
      break;
    case 'iyar': {
      // Yom HaAtzmaut is 5 Iyar, shifted to avoid Shabbat desecration
      const dow5 = (dow + (5 - d) + 70) % 7; // weekday of 5 Iyar
      let atz = 5;
      if (dow5 === 5) atz = 4; // Fri → Thu
      else if (dow5 === 6) atz = 3; // Sat → Thu
      else if (dow5 === 1) atz = 6; // Mon → Tue
      if (d === atz - 1) add('יום הזיכרון', 'memorial');
      if (d === atz) add('יום העצמאות', 'chag');
      if (d === 18) add('ל״ג בעומר', 'minor');
      if (d === 28) add('יום ירושלים', 'minor');
      break;
    }
    case 'sivan':
      if (d === 5) add('ערב שבועות', 'erev');
      if (d === 6) add('שבועות', 'chag');
      break;
    case 'tamuz':
      if ((d === 17 && dow !== 6) || (d === 18 && dow === 0)) add('י״ז בתמוז', 'fast');
      break;
    case 'av':
      if ((d === 9 && dow !== 6) || (d === 10 && dow === 0)) add('תשעה באב', 'fast');
      if (d === 15) add('ט״ו באב', 'minor');
      break;
  }

  if (purimMonth) {
    if ((d === 13 && dow !== 6) || (d === 11 && dow === 4)) add('תענית אסתר', 'fast');
    if (d === 14) add('פורים', 'chag');
    if (d === 15) add('שושן פורים', 'minor');
  }

  // Hanukkah: 8 days from 25 Kislev
  for (let k = 0; k < 8; k++) {
    const hk = hebrewDate(addDays(date, -k));
    if (hk.month === 'kislev' && hk.day === 25) {
      add(`חנוכה · יום ${['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳'][k]}`, 'minor');
      break;
    }
  }
  return out;
}
