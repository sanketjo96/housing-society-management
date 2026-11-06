// Checks browser-saved demo data (memory mode) and that json-server mode is unaffected.
// Usage: node persist.mjs <siteDir>   (json-server comes from demo/node_modules)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../e2e/package.json', import.meta.url)); // Playwright comes from e2e/
const { chromium } = require('playwright');
const [siteDir] = process.argv.slice(2);
const demoDir = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
let root = path.resolve(siteDir);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/demo/`;
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const errors = [];

async function fresh(init) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page };
}
const wait = (page, ms = 400) => page.waitForTimeout(ms);
async function submitPayment(page) {
  await page.locator('.pay-card button').click();
  await page.locator('.upi button').first().click();
  await page.locator('button', { hasText: 'Use sample' }).click();
  await page.locator('button', { hasText: 'Submit for review' }).click(); await wait(page, 150);
}
const underReview = (page) => page.locator('.pay-card .split3 span', { hasText: 'Under review' }).count();

// 1. Changes survive a reload; Reset clears them.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '#owner/home'); await wait(page);
  check('badge says saved in this browser', (await page.locator('.data-badge').innerText()).includes('saved in this browser'));
  check('starts with nothing under review', (await underReview(page)) === 0);
  await submitPayment(page);
  check('payment shows under review', (await underReview(page)) === 1);
  await page.reload(); await wait(page);
  check('payment still there after reload', (await underReview(page)) === 1);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('saral-demo:data:')));
  check('one saved copy, default scope', keys.length === 1 && keys[0].startsWith('saral-demo:data:default:'), keys.join(','));
  // Another tab of the same browser sees it too.
  const p2 = await ctx.newPage(); await p2.goto(base + '#owner/home'); await wait(p2);
  check('new tab sees saved data', (await underReview(p2)) === 1); await p2.close();
  // Preset data is kept apart.
  await page.goto(base + '?client=example#owner/home'); await wait(page);
  check('preset starts clean', (await underReview(page)) === 0);
  await submitPayment(page);
  await page.goto(base + '#owner/home'); await wait(page);
  check('default still has its own change', (await underReview(page)) === 1);
  const keys2 = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('saral-demo:data:')).sort());
  check('separate saved copy per preset', keys2.length === 2 && keys2.some((k) => k.startsWith('saral-demo:data:example:')), keys2.join(','));
  await page.locator('.res-side button', { hasText: 'Reset demo' }).click();
  await page.locator('button', { hasText: 'Reset all demo data' }).click(); await wait(page);
  check('reset restores seed', (await underReview(page)) === 0);
  await page.reload(); await wait(page);
  check('reset survives reload', (await underReview(page)) === 0);
  // 2. Editing the seed starts everyone on the new data.
  await submitPayment(page);
  const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'site-alt-'));
  fs.cpSync(root, alt, { recursive: true });
  const dbp = path.join(alt, 'demo', 'db.json'); const d = JSON.parse(fs.readFileSync(dbp, 'utf8'));
  d.notices.push({ id: 'N-999', title: 'Seed changed', body: 'x', audience: 'Everyone', date: '2026-11-03', pinned: true, whatsapp: false, reads: 0, ts: 9e12 });
  fs.writeFileSync(dbp, JSON.stringify(d, null, 2));
  root = alt;
  await page.reload(); await wait(page);
  check('edited seed replaces stale saved copy', (await underReview(page)) === 0 && (await page.locator('.list button.li', { hasText: 'Seed changed' }).count()) === 1);
  const keys3 = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('saral-demo:data:default:')));
  check('stale copy removed', keys3.length <= 1, keys3.join(','));
  root = path.resolve(siteDir);
  await ctx.close();
}

// 3. Storage refuses writes: keep going, say so once.
{
  const { ctx, page } = await fresh(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('saral-demo:data:')) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; });
  await page.goto(base + '#owner/home'); await wait(page);
  await submitPayment(page);
  check('app keeps working when storage is full', (await underReview(page)) === 1);
  check('user told once', (await page.locator('.toast', { hasText: 'won’t store more demo changes' }).count()) === 1);
  check('badge falls back to this tab only', (await page.locator('.data-badge').innerText()).includes('this tab only'));
  await ctx.close();
}

// 4. json-server mode still writes to the API; presets never do.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsrv-'));
  fs.cpSync(path.resolve(siteDir, 'demo'), tmp, { recursive: true });
  const port = 3000 + Math.floor(Math.random() * 900) + 100;
  const js = spawn(path.join(demoDir, 'node_modules/.bin/json-server'), ['db.json', '--port', String(port), '--static', '.', '--host', '127.0.0.1'], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] }); // same as npm start
  let jsOut = ''; js.stdout.on('data', (b) => { jsOut += b; }); js.stderr.on('data', (b) => { jsOut += b; });
  for (let i = 0; i < 40 && !/localhost|127.0.0.1|Resources/.test(jsOut); i++) await new Promise((r) => setTimeout(r, 250));
  if (!/Resources/.test(jsOut)) console.log('json-server output:', jsOut);
  const { ctx, page } = await fresh();
  await page.goto(`http://127.0.0.1:${port}/#owner/home`); await wait(page, 800);
  check('server mode badge', (await page.locator('.data-badge').innerText()).includes('Live API'));
  await submitPayment(page); await wait(page, 600);
  const after = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  check('server mode writes to db.json', after.ledger.some((r) => r.status === 'pending' && r.payer === 'Priya Nair' && r.proofImg));
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('saral-demo:data:')));
  check('server mode stores nothing in the browser', keys.length === 0, keys.join(','));
  const before = fs.readFileSync(path.join(tmp, 'db.json'), 'utf8');
  await page.goto(`http://127.0.0.1:${port}/?client=example#owner/home`); await wait(page, 800);
  check('preset ignores the server', (await page.locator('.data-badge').innerText()).includes('Sample data'));
  await submitPayment(page); await wait(page, 600);
  check('preset change leaves db.json alone', fs.readFileSync(path.join(tmp, 'db.json'), 'utf8') === before);
  await ctx.close(); js.kill();
}

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
