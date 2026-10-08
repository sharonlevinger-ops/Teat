-- סכמת מסד הנתונים של "קנאביס ביקורות"
-- עיקרון מנחה: אין נתון בלי מקור. כל עובדה על זן נשמרת כשורה נפרדת
-- עם source_url ו-fetched_at, כך ששני מקורות סותרים נשמרים זה לצד זה.

PRAGMA foreign_keys = ON;

-- אתרי המקור ומצב הבדיקה שלהם (robots.txt ותנאי שימוש)
CREATE TABLE IF NOT EXISTS sources (
  id                 TEXT PRIMARY KEY,          -- למשל 'cannapedia'
  name               TEXT NOT NULL,             -- שם תצוגה בעברית
  base_url           TEXT,                      -- NULL עד שהוגדרה כתובת אמיתית
  robots_status      TEXT NOT NULL DEFAULT 'unchecked', -- unchecked|allowed|disallowed|unreachable
  robots_checked_at  TEXT,
  tos_url            TEXT,
  tos_status         TEXT NOT NULL DEFAULT 'unreviewed', -- unreviewed|allowed|forbidden
  tos_note           TEXT,
  last_run_at        TEXT,
  last_run_status    TEXT
);

-- זן כפי שהוא מופיע בשוק הישראלי: שם מקומי + יצרן.
-- אותו שם אצל יצרנים שונים = שורות שונות. producer ריק = לא ידוע.
CREATE TABLE IF NOT EXISTS strains (
  id             INTEGER PRIMARY KEY,
  local_name     TEXT NOT NULL,
  producer       TEXT NOT NULL DEFAULT '',
  search_key     TEXT NOT NULL,               -- שם מנורמל לחיפוש (בלי מיני/סמול/פיסוק)
  created_at     TEXT NOT NULL,
  UNIQUE (search_key, producer)
);
CREATE INDEX IF NOT EXISTS strains_search ON strains(search_key);

-- מיפוי לשם גלובלי – נשמר רק כשיש מקור שקובע זאת במפורש
CREATE TABLE IF NOT EXISTS strain_aliases (
  id           INTEGER PRIMARY KEY,
  strain_id    INTEGER NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  global_name  TEXT NOT NULL,
  source_id    TEXT NOT NULL REFERENCES sources(id),
  source_url   TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  UNIQUE (strain_id, global_name, source_url)
);

-- עובדות על זן, שדה-שדה. field אחד מ:
-- name_en, type, thc, cbd, rating_avg, rating_count, effects, indications,
-- lineage, related, description_excerpt
CREATE TABLE IF NOT EXISTS strain_facts (
  id           INTEGER PRIMARY KEY,
  strain_id    INTEGER NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  field        TEXT NOT NULL,
  value_json   TEXT,                           -- NULL = המקור נבדק והשדה לא נמצא
  raw_value    TEXT,                           -- הטקסט המקורי לפני נרמול
  source_id    TEXT NOT NULL REFERENCES sources(id),
  source_url   TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  validation   TEXT NOT NULL DEFAULT 'single', -- single|agree|conflict (אימות הצלבה)
  UNIQUE (strain_id, field, source_url)
);
CREATE INDEX IF NOT EXISTS facts_strain ON strain_facts(strain_id, field);

-- קטעי ביקורת קצרים בלבד (לא העתקה מלאה) + קישור למקור
CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY,
  strain_id    INTEGER NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  sentiment    TEXT NOT NULL CHECK (sentiment IN ('positive','negative')),
  rating       REAL,                           -- 1-5 אם המקור נתן ציון
  excerpt      TEXT NOT NULL,                  -- עד 200 תווים
  source_id    TEXT NOT NULL REFERENCES sources(id),
  source_url   TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  UNIQUE (strain_id, source_url, excerpt)
);

-- תפריטים שהועלו (PDF) והפריטים שפוענחו מהם
CREATE TABLE IF NOT EXISTS menus (
  id           INTEGER PRIMARY KEY,
  store        TEXT,
  city         TEXT,
  menu_date    TEXT,
  source       TEXT,
  filename     TEXT,
  uploaded_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id                  INTEGER PRIMARY KEY,
  menu_id             INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  strain_id           INTEGER REFERENCES strains(id),
  name                TEXT NOT NULL,
  name_raw            TEXT,
  producer            TEXT,
  price_ils           REAL,
  original_price_ils  REAL,
  category            TEXT,                    -- T22/C4 וכו'
  thc                 INTEGER,                 -- נגזר מהקטגוריה (T22 → 22)
  cbd                 INTEGER,                 -- נגזר מהקטגוריה (C4 → 4)
  type                TEXT,                    -- sativa|indica|hybrid לפי התפריט
  search_key          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS menu_items_search ON menu_items(search_key);

-- מטמון HTTP: כל דף שנאסף נשמר, כדי לא לפנות לאתר שוב בלי צורך
CREATE TABLE IF NOT EXISTS http_cache (
  url          TEXT PRIMARY KEY,
  status       INTEGER NOT NULL,
  body         TEXT,
  fetched_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id           INTEGER PRIMARY KEY,
  source_id    TEXT,
  at           TEXT NOT NULL,
  level        TEXT NOT NULL,
  message      TEXT NOT NULL
);
