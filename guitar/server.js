// שרת קטן לאתר הגיטרה: מגיש את הקבצים וגם שומר התקדמות לכל משתמש (שם + קוד סודי).
// בלי תלויות חיצוניות. דרוש Node.js 18 ומעלה.
//
// משתני סביבה:
//   PORT            הפורט (ברירת מחדל 3002)
//   DATA_DIR        איפה נשמרים הפרופילים (ברירת מחדל ./data). בשרת אמיתי חייבת להיות תיקייה קבועה (דיסק).
//   SITE_PASSWORD   אופציונלי: סיסמה אחת לכל האתר, כך שרק מי שיודע אותה נכנס (משתמש: כל שם).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { merge, pick } = require('./sync.js');

const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const PRIVATE = new Set(['server.js', 'build-single.js', 'package.json', 'README.md', 'render.yaml', 'Dockerfile']);
const MAX_BODY = 300 * 1024;

function createServer(opts = {}) {
  const dataDir = path.resolve(opts.dataDir || process.env.DATA_DIR || path.join(ROOT, 'data'));
  const sitePassword = opts.sitePassword !== undefined ? opts.sitePassword : process.env.SITE_PASSWORD || '';
  const file = path.join(dataDir, 'profiles.json');
  fs.mkdirSync(dataDir, { recursive: true });
  let db = {};
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    db = {};
  }
  const persist = () => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  };

  const hits = new Map(); // הגבלת קצב לפי כתובת
  const fails = new Map(); // ניסיונות כושלים לפי משתמש
  const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const limited = (req) => {
    const now = Date.now();
    const k = ip(req);
    const arr = (hits.get(k) || []).filter((t) => now - t < 60000);
    arr.push(now);
    hits.set(k, arr);
    return arr.length > 60;
  };

  const send = (res, code, body, type) => {
    res.writeHead(code, {
      'Content-Type': type || 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'microphone=(self)',
      'Cache-Control': 'no-cache',
    });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');
  const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('too big'), { code: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function sync(req, res) {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.code === 413 ? 413 : 400, { error: 'בקשה לא תקינה' });
    }
    const user = String(body.user || '').trim();
    const pin = String(body.pin || '');
    if (!/^[\p{L}\p{N}_.\- ]{2,30}$/u.test(user)) return send(res, 400, { error: 'שם משתמש: 2 עד 30 תווים (אותיות, ספרות, רווח, מקף)' });
    if (pin.length < 4 || pin.length > 64) return send(res, 400, { error: 'הקוד הסודי צריך להיות באורך 4 תווים לפחות' });
    const key = user.toLowerCase();
    const f = fails.get(key);
    if (f && f.n >= 5 && Date.now() - f.t < 5 * 60000) return send(res, 429, { error: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.' });

    let rec = db[key];
    let created = false;
    if (!rec) {
      if (Object.keys(db).length >= 5000) return send(res, 503, { error: 'השרת מלא' });
      const salt = crypto.randomBytes(16).toString('hex');
      rec = db[key] = { name: user, salt, hash: hashPin(pin, salt), data: pick({}), updated: Date.now() };
      created = true;
    } else if (!safeEq(rec.hash, hashPin(pin, rec.salt))) {
      fails.set(key, { n: (f && Date.now() - f.t < 5 * 60000 ? f.n : 0) + 1, t: Date.now() });
      return send(res, 401, { error: 'שם או קוד סודי לא נכונים' });
    }
    fails.delete(key);
    rec.data = merge(rec.data, body.data ? pick(body.data) : {});
    rec.updated = Date.now();
    persist();
    return send(res, 200, { ok: true, created, name: rec.name, data: rec.data });
  }

  function authorized(req) {
    if (!sitePassword) return true;
    const h = String(req.headers.authorization || '');
    if (!h.startsWith('Basic ')) return false;
    const pass = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
    return safeEq(crypto.createHash('sha256').update(pass).digest('hex'), crypto.createHash('sha256').update(sitePassword).digest('hex'));
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
    const abs = path.resolve(ROOT, rel);
    const name = path.basename(abs);
    if (!abs.startsWith(ROOT + path.sep) || PRIVATE.has(name) || abs.includes(path.sep + 'test' + path.sep) || abs.includes(path.sep + 'data' + path.sep) || name.startsWith('.')) return send(res, 404, 'לא נמצא', 'text/plain; charset=utf-8');
    fs.readFile(abs, (err, buf) => {
      if (err) return send(res, 404, 'לא נמצא', 'text/plain; charset=utf-8');
      send(res, 200, buf, MIME[path.extname(abs)] || 'application/octet-stream');
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      if (pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
      if (!authorized(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="guitar", charset="UTF-8"' });
        return res.end('נדרשת סיסמה');
      }
      if (limited(req)) return send(res, 429, { error: 'יותר מדי בקשות' });
      if (pathname === '/api/ping') return send(res, 200, { ok: true });
      if (pathname === '/api/sync' && req.method === 'POST') return await sync(req, res);
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'לא נמצא' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'לא נתמך', 'text/plain');
      return serveStatic(req, res, pathname);
    } catch (e) {
      return send(res, 500, { error: 'שגיאה בשרת' });
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3002;
  createServer().listen(port, () => console.log(`אתר הגיטרה פועל על פורט ${port}`));
}
module.exports = { createServer };
