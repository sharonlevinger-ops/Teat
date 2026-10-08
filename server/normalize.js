// נרמול שמות, סוגים וערכים. אין כאן "ניחוש" נתונים – רק המרה של טקסט
// שכבר נמצא במקור לצורה אחידה. ערך שלא ניתן לפענח מוחזר כ-null.

const SIZE_WORDS = ['מיניז', 'מיני', 'סמול', 'minis', 'mini', 'small'];
const FINAL_LETTERS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** מפתח חיפוש: בלי מיני/סמול, בלי פיסוק, אותיות סופיות רגילות, אותיות קטנות */
export function searchKey(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.replace(/[֑-ׇ]/g, ''); // ניקוד
  s = s.replace(/[׳']/g, '').replace(/[״"]/g, '');
  s = s.replace(/[.\-_/\\,:;!?()[\]{}#&+*~`|]/g, ' ');
  s = s.replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c]);
  const words = s.split(/\s+/).filter((w) => w && !SIZE_WORDS.includes(w));
  return words.join(' ').trim();
}

export function normalizeProducer(p) {
  return p ? String(p).replace(/…$/, '').replace(/\s+/g, ' ').trim() : '';
}

/** sativa | indica | hybrid | null */
export function normalizeType(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  const sat = /סאטיב|סטיב|sativa/.test(s);
  const ind = /אינדיק|indica/.test(s);
  if (/היי?בריד|היברידי|hybrid/.test(s)) return 'hybrid';
  if (sat && ind) return 'hybrid';
  if (sat) return 'sativa';
  if (ind) return 'indica';
  return null;
}

export const TYPE_LABELS_HE = { sativa: 'סאטיבה', indica: 'אינדיקה', hybrid: 'היברידית' };

/** "T22/C4" → { thc: 22, cbd: 4 } ; ערך לא תקין → nulls */
export function parseCategory(cat) {
  const m = cat && String(cat).match(/T\s*(\d+)\s*\/?\s*C\s*(\d+)/i);
  return m ? { thc: Number(m[1]), cbd: Number(m[2]) } : { thc: null, cbd: null };
}

export function normalizeCategory(cat) {
  const { thc, cbd } = parseCategory(cat);
  return thc === null ? null : `T${thc}/C${cbd}`;
}

/** "22%" / "THC: 18-22%" → מספר (אמצע טווח) ; אחרת null */
export function parsePercent(raw) {
  if (raw === null || raw === undefined) return null;
  const nums = String(raw).match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const vals = nums.map(Number).filter((n) => n >= 0 && n <= 100);
  if (!vals.length) return null;
  if (vals.length >= 2) return Math.round(((vals[0] + vals[1]) / 2) * 10) / 10;
  return vals[0];
}

/** ציון לסקאלה 1-5. scaleMax = הסקאלה של המקור (5, 10, 100) */
export function normalizeRating(raw, scaleMax = 5) {
  const n = Number(String(raw ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(n) || n <= 0 || n > scaleMax) return null;
  const v = scaleMax === 5 ? n : (n / scaleMax) * 5;
  return Math.round(Math.max(1, Math.min(5, v)) * 100) / 100;
}

/** "אב1 × אב2" / "A x B" → { parents: [A, B] } ; אחרת null */
export function parseLineage(raw) {
  if (!raw) return null;
  const parts = String(raw)
    .split(/\s+[x×X]\s+|\s*×\s*|\s+X\s+|\s*\bcross\b\s*|\s+הכלאה של\s+|\s+עם\s+/)
    .map((s) => s.replace(/^[\s:–-]+|[\s.–-]+$/g, '').trim())
    .filter(Boolean);
  return parts.length >= 2 ? { parents: parts.slice(0, 2) } : null;
}

/** רשימה מופרדת בפסיקים/נקודות → מערך מילים ייחודי */
export function parseList(raw) {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[,،;|•\n]+/);
  const out = [...new Set(arr.map((s) => String(s).trim()).filter((s) => s && s.length <= 60))];
  return out.length ? out : null;
}

/** קיצור ביקורת לקטע קצר בלבד (זכויות יוצרים) */
export const EXCERPT_MAX = 200;
export function excerpt(text, max = EXCERPT_MAX) {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}…`;
}

/** השוואת שני ערכים מנורמלים לצורך אימות הצלבה */
export function valuesAgree(field, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return true;
  if (field === 'thc' || field === 'cbd') return Math.abs(Number(a) - Number(b)) <= 2;
  if (field === 'rating_avg') return Math.abs(Number(a) - Number(b)) <= 0.75;
  if (field === 'lineage') {
    const pa = (a.parents || []).map(searchKey).sort().join('|');
    const pb = (b.parents || []).map(searchKey).sort().join('|');
    return pa === pb;
  }
  if (Array.isArray(a) || Array.isArray(b)) return true; // רשימות משלימות זו את זו
  return JSON.stringify(a) === JSON.stringify(b);
}
