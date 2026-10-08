// שכבת גישה למסד SQLite (node:sqlite המובנה ב-Node 22, בלי תלות native).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  searchKey,
  normalizeProducer,
  parseCategory,
  valuesAgree,
  excerpt,
  EXCERPT_MAX,
} from './normalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const now = () => new Date().toISOString();

export function openDb(file = process.env.DB_FILE || path.join(here, '..', 'data', 'cannabis.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(here, 'db.sql'), 'utf8'));
  return db;
}

// ---------- sources ----------
export function upsertSource(db, s) {
  db.prepare(
    `INSERT INTO sources (id, name, base_url, tos_url) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, base_url=excluded.base_url, tos_url=excluded.tos_url`,
  ).run(s.id, s.name, s.base_url ?? null, s.tos_url ?? null);
}

export function updateSourceStatus(db, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.prepare(`UPDATE sources SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    id,
  );
}

export function listSources(db) {
  return db.prepare('SELECT * FROM sources ORDER BY id').all();
}

export function log(db, sourceId, level, message) {
  db.prepare('INSERT INTO scrape_log (source_id, at, level, message) VALUES (?, ?, ?, ?)').run(
    sourceId,
    now(),
    level,
    message,
  );
}

// ---------- strains ----------
export function getOrCreateStrain(db, localName, producer) {
  const key = searchKey(localName);
  const prod = normalizeProducer(producer);
  if (!key) throw new Error('שם זן ריק');
  const found = db.prepare('SELECT * FROM strains WHERE search_key = ? AND producer = ?').get(key, prod);
  if (found) return found;
  const r = db
    .prepare('INSERT INTO strains (local_name, producer, search_key, created_at) VALUES (?, ?, ?, ?)')
    .run(localName.trim(), prod, key, now());
  return db.prepare('SELECT * FROM strains WHERE id = ?').get(r.lastInsertRowid);
}

/**
 * שמירת עובדה עם אימות הצלבה: לפני השמירה משווים לערכים שמקורות אחרים
 * כבר נתנו לאותו שדה. סתירה מסמנת את כל הערכים המעורבים כ-conflict
 * (שניהם נשמרים ומוצגים עם המקור), הסכמה מסמנת agree.
 */
export function saveFact(db, { strainId, field, value, raw, sourceId, sourceUrl, fetchedAt }) {
  if (!sourceUrl || !fetchedAt) throw new Error(`לא נשמר ${field}: חסר source_url/fetched_at`);
  const others = db
    .prepare(
      'SELECT id, value_json FROM strain_facts WHERE strain_id = ? AND field = ? AND source_id != ? AND value_json IS NOT NULL',
    )
    .all(strainId, field, sourceId);
  let validation = 'single';
  if (value !== null && value !== undefined && others.length) {
    const conflicts = others.filter((o) => !valuesAgree(field, value, JSON.parse(o.value_json)));
    validation = conflicts.length ? 'conflict' : 'agree';
    const mark = db.prepare('UPDATE strain_facts SET validation = ? WHERE id = ?');
    for (const o of others) {
      const isConflict = conflicts.includes(o);
      mark.run(isConflict ? 'conflict' : 'agree', o.id);
    }
  }
  db.prepare(
    `INSERT INTO strain_facts (strain_id, field, value_json, raw_value, source_id, source_url, fetched_at, validation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(strain_id, field, source_url) DO UPDATE SET
       value_json=excluded.value_json, raw_value=excluded.raw_value,
       fetched_at=excluded.fetched_at, validation=excluded.validation`,
  ).run(
    strainId,
    field,
    value === null || value === undefined ? null : JSON.stringify(value),
    raw === null || raw === undefined ? null : String(raw).slice(0, 500),
    sourceId,
    sourceUrl,
    fetchedAt,
    validation,
  );
  return validation;
}

export function saveReview(db, { strainId, sentiment, rating, text, sourceId, sourceUrl, fetchedAt }) {
  const ex = excerpt(text, EXCERPT_MAX);
  if (!ex || !sourceUrl) return;
  db.prepare(
    `INSERT OR IGNORE INTO reviews (strain_id, sentiment, rating, excerpt, source_id, source_url, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(strainId, sentiment, rating ?? null, ex, sourceId, sourceUrl, fetchedAt);
}

export function saveAlias(db, { strainId, globalName, sourceId, sourceUrl, fetchedAt }) {
  if (!globalName || !sourceUrl) return;
  db.prepare(
    `INSERT OR IGNORE INTO strain_aliases (strain_id, global_name, source_id, source_url, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(strainId, globalName.trim(), sourceId, sourceUrl, fetchedAt);
}

// ---------- menus ----------
export function saveMenu(db, parsed, filename) {
  const r = db
    .prepare('INSERT INTO menus (store, city, menu_date, source, filename, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(parsed.store, parsed.city, parsed.date, parsed.source, filename ?? null, now());
  const menuId = Number(r.lastInsertRowid);
  const ins = db.prepare(
    `INSERT INTO menu_items (menu_id, strain_id, name, name_raw, producer, price_ils, original_price_ils,
       category, thc, cbd, type, search_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const it of parsed.items) {
      const strain = getOrCreateStrain(db, it.name, it.producer);
      const { thc, cbd } = parseCategory(it.category);
      ins.run(
        menuId,
        strain.id,
        it.name,
        it.name_raw ?? null,
        it.producer ?? null,
        it.price_ils ?? null,
        it.original_price_ils ?? null,
        it.category ?? null,
        thc,
        cbd,
        it.type ?? null,
        searchKey(it.name),
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return menuId;
}

export function listMenus(db) {
  return db
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM menu_items i WHERE i.menu_id = m.id) AS item_count
       FROM menus m ORDER BY m.id DESC`,
    )
    .all();
}

// ---------- queries ----------
function strainSummary(db, strainId) {
  const facts = db
    .prepare(`SELECT field, value_json FROM strain_facts WHERE strain_id = ? AND value_json IS NOT NULL`)
    .all(strainId);
  const by = {};
  for (const f of facts) (by[f.field] ||= []).push(JSON.parse(f.value_json));
  const reviews = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE strain_id = ?').get(strainId).n;
  return { sourced_types: [...new Set(by.type || [])], has_source_data: facts.length > 0, review_count: reviews };
}

/**
 * חיפוש וסינון. q מחופש אחרי נרמול (בלי מיני/סמול), בעברית ובאנגלית
 * (שם אנגלי וכינויים גלובליים נלקחים מהעובדות שנאספו).
 */
export function search(db, { q = '', category, type, producer, thcMin, thcMax, cbdMin, cbdMax, menuId } = {}) {
  const key = searchKey(q);
  const where = [];
  const params = [];
  if (key) {
    where.push(`(i.search_key LIKE ? OR i.strain_id IN (
      SELECT strain_id FROM strain_aliases WHERE lower(global_name) LIKE ?
      UNION SELECT strain_id FROM strain_facts WHERE field = 'name_en' AND lower(value_json) LIKE ?))`);
    params.push(`%${key}%`, `%${q.toLowerCase().trim()}%`, `%${q.toLowerCase().trim()}%`);
  }
  if (category) { where.push('i.category = ?'); params.push(category); }
  if (type) { where.push('i.type = ?'); params.push(type); }
  if (producer) { where.push('i.producer = ?'); params.push(producer); }
  if (thcMin !== undefined && thcMin !== '') { where.push('i.thc >= ?'); params.push(Number(thcMin)); }
  if (thcMax !== undefined && thcMax !== '') { where.push('i.thc <= ?'); params.push(Number(thcMax)); }
  if (cbdMin !== undefined && cbdMin !== '') { where.push('i.cbd >= ?'); params.push(Number(cbdMin)); }
  if (cbdMax !== undefined && cbdMax !== '') { where.push('i.cbd <= ?'); params.push(Number(cbdMax)); }
  if (menuId) { where.push('i.menu_id = ?'); params.push(Number(menuId)); }
  const rows = db
    .prepare(
      `SELECT i.*, m.source AS menu_source, m.menu_date
       FROM menu_items i JOIN menus m ON m.id = i.menu_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY i.category DESC, i.type, i.price_ils
       LIMIT 500`,
    )
    .all(...params);
  const items = rows.map((r) => ({ ...r, ...strainSummary(db, r.strain_id) }));

  // זנים שנאספו ממקורות אך לא מופיעים באף תפריט
  let strainsOnly = [];
  if (key && !category && !type && !producer && !menuId) {
    const ids = new Set(items.map((i) => i.strain_id));
    strainsOnly = db
      .prepare(
        `SELECT s.* FROM strains s WHERE (s.search_key LIKE ? OR s.id IN (
           SELECT strain_id FROM strain_aliases WHERE lower(global_name) LIKE ?
           UNION SELECT strain_id FROM strain_facts WHERE field = 'name_en' AND lower(value_json) LIKE ?))
         LIMIT 100`,
      )
      .all(`%${key}%`, `%${q.toLowerCase().trim()}%`, `%${q.toLowerCase().trim()}%`)
      .filter((s) => !ids.has(s.id))
      .map((s) => ({ ...s, ...strainSummary(db, s.id) }))
      .filter((s) => s.has_source_data);
  }
  return { items, strains: strainsOnly };
}

export function filterOptions(db) {
  const col = (c) =>
    db.prepare(`SELECT DISTINCT ${c} AS v FROM menu_items WHERE ${c} IS NOT NULL ORDER BY ${c}`).all().map((r) => r.v);
  const range = db.prepare('SELECT MIN(thc) a, MAX(thc) b, MIN(cbd) c, MAX(cbd) d FROM menu_items').get();
  return {
    categories: col('category').sort((a, b) => parseCategory(b).thc - parseCategory(a).thc || parseCategory(a).cbd - parseCategory(b).cbd),
    types: col('type'),
    producers: col('producer'),
    thc: [range.a, range.b],
    cbd: [range.c, range.d],
  };
}

const CARD_FIELDS = ['name_en', 'type', 'thc', 'cbd', 'rating_avg', 'rating_count', 'effects', 'indications', 'lineage', 'related'];

/** כרטיס זן: כל ערך מוחזר עם המקור שלו; שדה בלי מקור → null ("לא זמין") */
export function strainCard(db, id) {
  const strain = db.prepare('SELECT * FROM strains WHERE id = ?').get(id);
  if (!strain) return null;
  const facts = db
    .prepare(
      `SELECT f.*, s.name AS source_name FROM strain_facts f JOIN sources s ON s.id = f.source_id
       WHERE f.strain_id = ? ORDER BY f.fetched_at DESC`,
    )
    .all(id);
  const fields = {};
  for (const name of CARD_FIELDS) {
    const vals = facts
      .filter((f) => f.field === name && f.value_json !== null)
      .map((f) => ({
        value: JSON.parse(f.value_json),
        raw: f.raw_value,
        source_id: f.source_id,
        source_name: f.source_name,
        source_url: f.source_url,
        fetched_at: f.fetched_at,
        validation: f.validation,
      }));
    fields[name] = vals.length ? vals : null;
  }

  // ציון ממוצע משוקלל לפי מספר המדרגים בכל מקור (רק כשיש גם ציון וגם מספר)
  let rating = null;
  if (fields.rating_avg) {
    const parts = fields.rating_avg.map((r) => {
      const cnt = fields.rating_count?.find((c) => c.source_url === r.source_url);
      return { avg: r.value, count: cnt ? cnt.value : null, source_name: r.source_name, source_url: r.source_url };
    });
    const weighted = parts.filter((p) => p.count);
    const total = weighted.reduce((a, p) => a + p.count, 0);
    rating = {
      combined: total ? Math.round((weighted.reduce((a, p) => a + p.avg * p.count, 0) / total) * 100) / 100 : null,
      count: total || null,
      by_source: parts,
    };
  }

  const reviewsOf = (sentiment) =>
    db
      .prepare(
        `SELECT r.*, s.name AS source_name FROM reviews r JOIN sources s ON s.id = r.source_id
         WHERE r.strain_id = ? AND r.sentiment = ? ORDER BY r.rating ${sentiment === 'positive' ? 'DESC' : 'ASC'}, r.id LIMIT 5`,
      )
      .all(id, sentiment);

  const aliases = db
    .prepare(
      `SELECT a.global_name, a.source_url, a.fetched_at, s.name AS source_name
       FROM strain_aliases a JOIN sources s ON s.id = a.source_id WHERE a.strain_id = ?`,
    )
    .all(id);

  const menuAppearances = db
    .prepare(
      `SELECT i.name, i.producer, i.price_ils, i.original_price_ils, i.category, i.type, m.source, m.menu_date, m.id AS menu_id
       FROM menu_items i JOIN menus m ON m.id = i.menu_id WHERE i.strain_id = ? ORDER BY m.id DESC`,
    )
    .all(id);

  // זנים עם אותו שם אצל יצרן אחר – מוצגים כ"לא בהכרח אותו זן"
  const sameName = db
    .prepare('SELECT id, local_name, producer FROM strains WHERE search_key = ? AND id != ?')
    .all(strain.search_key, id);

  const sources = [...new Map(
    [...facts, ...reviewsOf('positive'), ...reviewsOf('negative'), ...aliases]
      .map((f) => [f.source_url, { source_name: f.source_name, source_url: f.source_url, fetched_at: f.fetched_at }]),
  ).values()];

  return {
    strain,
    fields,
    rating,
    reviews: { positive: reviewsOf('positive'), negative: reviewsOf('negative') },
    aliases,
    menu_appearances: menuAppearances,
    same_name_other_producers: sameName,
    sources,
  };
}
