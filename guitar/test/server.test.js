const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server.js');

let server;
let base;
let dir;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guitar-'));
  server = createServer({ dataDir: dir, sitePassword: '' });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const post = (body, url = '/api/sync') => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('השרת מגיש את האתר ואת הקבצים, ולא מגיש קבצים פנימיים', async () => {
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /תרגילי גיטרה/);
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal((await fetch(base + '/server.js')).status, 404);
  assert.equal((await fetch(base + '/test/server.test.js')).status, 404);
  assert.equal((await fetch(base + '/../package.json')).status, 404);
  assert.equal((await fetch(base + '/data/profiles.json')).status, 404);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});

test('יצירת פרופיל, שמירה, וקריאה ממכשיר אחר עם מיזוג', async () => {
  const day1 = { log: { 'a': [{ at: '2026-01-01T10:00:00Z', bpm: 60 }] }, active: ['2026-01-01'], jams: 1 };
  let r = await post({ user: 'שרון', pin: '1234', data: day1 });
  let j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.created, true);
  const day2 = { log: { a: [{ at: '2026-01-02T10:00:00Z', bpm: 70 }] }, active: ['2026-01-02'], jams: 0 };
  r = await post({ user: 'שרון', pin: '1234', data: day2 });
  j = await r.json();
  assert.equal(j.created, false);
  assert.equal(j.data.log.a.length, 2);
  assert.deepEqual(j.data.active, ['2026-01-01', '2026-01-02']);
  r = await post({ user: 'שרון', pin: '1234' });
  assert.equal((await r.json()).data.jams, 1);
  assert.ok(fs.existsSync(path.join(dir, 'profiles.json')));
  const raw = fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8');
  assert.ok(!raw.includes('1234'), 'הקוד הסודי לא נשמר בגלוי');
});

test('קוד שגוי נדחה, אחרי חמש טעויות נחסם זמנית, ולכל משתמש נתונים נפרדים', async () => {
  await post({ user: 'dana', pin: 'abcd', data: { jams: 7 } });
  for (let i = 0; i < 5; i++) assert.equal((await post({ user: 'dana', pin: 'wrong!' })).status, 401);
  assert.equal((await post({ user: 'dana', pin: 'abcd' })).status, 429);
  const other = await (await post({ user: 'other', pin: 'zzzz' })).json();
  assert.equal(other.data.jams, 0);
});

test('בקשות לא תקינות: שם קצר, קוד קצר, JSON שבור, גוף גדול', async () => {
  assert.equal((await post({ user: 'a', pin: '1234' })).status, 400);
  assert.equal((await post({ user: 'valid', pin: '12' })).status, 400);
  const bad = await fetch(base + '/api/sync', { method: 'POST', body: '{bad' });
  assert.equal(bad.status, 400);
  const big = await fetch(base + '/api/sync', { method: 'POST', body: JSON.stringify({ user: 'big', pin: '1234', pad: 'x'.repeat(400000) }) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
});

test('סיסמת אתר אופציונלית: בלעדיה לא נכנסים, איתה כן', async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'guitar-'));
  const s2 = createServer({ dataDir: d2, sitePassword: 'secret' });
  await new Promise((r) => s2.listen(0, r));
  const b2 = 'http://127.0.0.1:' + s2.address().port;
  assert.equal((await fetch(b2 + '/')).status, 401);
  const ok = await fetch(b2 + '/', { headers: { Authorization: 'Basic ' + Buffer.from('friend:secret').toString('base64') } });
  assert.equal(ok.status, 200);
  const no = await fetch(b2 + '/', { headers: { Authorization: 'Basic ' + Buffer.from('friend:nope').toString('base64') } });
  assert.equal(no.status, 401);
  assert.equal((await fetch(b2 + '/healthz')).status, 200);
  s2.close();
  fs.rmSync(d2, { recursive: true, force: true });
});
