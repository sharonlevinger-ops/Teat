// Browser smoke test: boots the real game (iPhone 13 Pro Max size) in headless Chromium, plays for a while with
// the keyboard and touch, opens every card, and fails on ANY page error or console error.
// Usage: node saga/tools/smoke.cjs   (uses the pre-installed Playwright + Chromium)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13 Pro Max'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { errors.push(`${name}: ${e.message}`); console.log('FAIL', name); } };

  await step('boot', async () => { await page.goto(url); await page.waitForFunction(() => window.__saga, null, { timeout: 30000 }); });
  await step('attract mode runs', async () => { await page.waitForTimeout(1500); });
  await step('journal from the pause button (between games)', async () => { await page.click('#btn-pause'); await page.waitForTimeout(200); for (const t of ['saga', 'missions', 'awards', 'scores']) await page.click(`[data-tab="${t}"]`); await page.click('.journal [data-a="help"]'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); });
  await step('start a game', async () => { await page.evaluate(() => window.__saga.startGame()); await page.waitForTimeout(300); });
  await step('play 25 s (launch, flippers, nudges)', async () => {
    for (let i = 0; i < 50; i++) {
      if (await page.evaluate(() => window.__saga.sim.canLaunch())) { await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Space'); }
      await page.keyboard.down(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(120); await page.keyboard.up(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      if (i % 17 === 5) await page.keyboard.press('KeyT');
      await page.waitForTimeout(380);
    }
  });
  await step('every mode at once (lock, multiball, dragon, frenzy, rush)', async () => {
    await page.evaluate(() => { const s = window.__saga.sim, r = s.rules; r.locks = 2; for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onWizardHit(0, 0); } const b = s.world.balls.find((x) => x.active); if (b) { b.mode = 'tower'; r.onTowerEnter(b); } r.dragonReady = true; r.onScoop(); r.frenzyTicks = 2000; r._startRush(); });
    await page.waitForTimeout(3000);
  });
  await step('pause, report, how to play, voice toggle, tuning', async () => {
    await page.click('#btn-pause'); await page.waitForTimeout(200);
    await page.click('#btn-report'); await page.waitForTimeout(500);
    await page.click('#btn-help'); await page.keyboard.press('Escape');
    await page.click('#btn-voice'); await page.click('#btn-voice');
    // long-press the title with a real touch (what the iPhone sends) -> tuning panel
    const box = await page.locator('#pause h2').boundingBox();
    const cdp = await ctx.newCDPSession(page), pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(1300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForSelector('.tune:not(.hidden)', { timeout: 3000 });
    await page.click('.tune [data-a="close"]');
    await page.click('#btn-resume');
  });
  await step('game over -> summary -> play again', async () => {
    await page.evaluate(() => { const s = window.__saga.sim, r = s.rules; r.ball = 3; r.extraBalls = 0; r.matchDone = true; r.dragonTicks = 0; r.multiball = false; r.saveTicks = 0; for (const b of s.world.balls) if (b.active && b.mode !== 'held') s._place(b, 10.5, -2, 0, -10, 'free'); });
    await page.waitForFunction(() => window.__saga.sim.rules.state === 'gameover', null, { timeout: 15000 });
    await page.waitForSelector('.summary:not(.hidden)', { timeout: 8000 });
    await page.click('#btn-again'); await page.waitForTimeout(500);
  });
  await step('camera view 2', async () => { await page.click('#btn-camera'); await page.waitForTimeout(800); await page.click('#btn-camera'); });
  await step('table 2 (Forest Kingdom): switch, play, every Kingdom feature', async () => {
    await page.goto(url + '?table=kingdom');
    await page.waitForFunction(() => window.__saga && window.__saga.table === 'kingdom', null, { timeout: 30000 });
    await page.evaluate(() => window.__saga.startGame());
    await page.waitForTimeout(300);
    for (let i = 0; i < 16; i++) {
      if (await page.evaluate(() => window.__saga.sim.canLaunch())) { await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Space'); }
      await page.keyboard.down(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(120); await page.keyboard.up(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await page.waitForTimeout(380);
    }
    await page.evaluate(() => { const s = window.__saga.sim, r = s.rules; for (const id of ['shield1', 'shield2', 'shield3']) { r.cooldowns.clear(); r.onElementHit(id, 0, 0); } for (let i = 0; i < 3; i++) { r.cooldowns.clear(); r.onElementHit('castleGate', 0, 0); } for (let i = 0; i < 7; i++) r.onMine(); r.onSpinner(50); });
    await page.waitForTimeout(2500);
    await page.click('#btn-pause'); await page.waitForTimeout(200); await page.click('#btn-help'); await page.keyboard.press('Escape'); await page.click('#btn-resume');
  });
  await step('back to table 1 with the table button', async () => {
    await page.evaluate(() => { const s = window.__saga.sim, r = s.rules; r.ball = 3; r.extraBalls = 0; r.matchDone = true; r.saveTicks = 0; for (const b of s.world.balls) if (b.active && b.mode !== 'held') s._place(b, 10.5, -2, 0, -10, 'free'); });
    await page.waitForFunction(() => window.__saga.sim.rules.state === 'gameover', null, { timeout: 15000 });
    await page.waitForSelector('.summary:not(.hidden)', { timeout: 8000 });
    await page.click('#btn-sum-close');
    await Promise.all([page.waitForNavigation(), page.click('#btn-table')]);
    await page.waitForFunction(() => window.__saga && window.__saga.table === 'forest', null, { timeout: 30000 });
  });

  await browser.close(); server.close();
  if (errors.length) { console.error('\nSMOKE TEST FAILED:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nsmoke test passed: no page errors');
})().catch((e) => { console.error(e); process.exit(1); });
