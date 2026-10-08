// שרת ה-API (Express). מופרד מ-index.js כדי שאפשר יהיה לבדוק אותו.
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMenuPdf } from './menu/parsePdf.js';
import { saveMenu, listMenus, search, filterOptions, strainCard, listSources, upsertSource } from './db.js';
import { loadSourceConfig } from './scrape.js';
import { SITES } from './scrapers/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)),
  });

  // רישום המקורות במסד כדי שדוח המקורות יוצג גם לפני האיסוף הראשון
  const configs = loadSourceConfig();
  for (const site of SITES) {
    const c = configs.find((x) => x.id === site.id) || {};
    upsertSource(db, { id: site.id, name: site.name, base_url: c.base_url, tos_url: c.tos_url });
  }

  app.get('/api/search', (req, res) => res.json(search(db, req.query)));
  app.get('/api/filters', (_req, res) => res.json(filterOptions(db)));
  app.get('/api/menus', (_req, res) => res.json(listMenus(db)));

  app.get('/api/strains/:id', (req, res) => {
    const card = strainCard(db, Number(req.params.id));
    if (!card) return res.status(404).json({ error: 'הזן לא נמצא' });
    res.json(card);
  });

  app.get('/api/sources', (_req, res) => {
    const notes = Object.fromEntries(SITES.map((s) => [s.id, s.notes]));
    res.json(listSources(db).map((s) => ({ ...s, notes: notes[s.id] || null })));
  });

  app.post('/api/menus', upload.single('menu'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'יש לצרף קובץ PDF בשדה menu' });
    try {
      const parsed = await parseMenuPdf(req.file.buffer);
      if (!parsed.items.length) {
        return res.status(422).json({ error: 'לא נמצאו תפרחות בקובץ. ייתכן שהתפריט במבנה שונה או סרוק כתמונה.' });
      }
      const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const menuId = saveMenu(db, parsed, filename);
      res.json({ menu_id: menuId, store: parsed.store, city: parsed.city, date: parsed.date, source: parsed.source, count: parsed.items.length });
    } catch (e) {
      res.status(400).json({ error: `פענוח ה-PDF נכשל: ${e.message}` });
    }
  });

  const dist = path.join(here, '..', 'web', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return app;
}
