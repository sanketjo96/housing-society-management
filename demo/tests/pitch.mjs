// Checks pitch mode (?pitch=1): labels off without touching the saved choice,
// and the guide walks through the payment loop on desktop and on a phone.
// Usage: node pitch.mjs <siteDir> [shotDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../e2e/package.json', import.meta.url)); // Playwright comes from e2e/
const { chromium } = require('playwright');
const [siteDir, shotDir] = process.argv.slice(2);
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(path.resolve(siteDir), p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/demo/`;
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const errors = [];

async function loop(label, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  const wait = (ms = 350) => page.waitForTimeout(ms);
  const shot = async (n) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, `${label}-${n}.png`) }); };
  const step = async () => (await page.locator('.tour .eyebrow').textContent().catch(() => '') || '').trim();
  const cta = () => page.locator('.tour .btn.primary').click();

  // A saved "labels on" choice must survive a pitch visit.
  await page.goto(base + '?labels=1'); await wait();
  await page.goto('about:blank'); await page.goto(base + '?pitch=1'); await wait();
  check(`${label}: guide on the login screen`, (await step()) === 'Step 1 of 3', await step());
  await shot('1-login');
  await cta(); await wait();
  check(`${label}: guide opens the owner's app`, (await page.evaluate(() => location.hash)) === '#owner/home');
  check(`${label}: no PRD labels in pitch mode`, (await page.locator('.prd-tag, .prd-strip').count()) === 0);
  check(`${label}: guide stays inside the screen`, await page.locator('.tour').evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  await shot('2-owner');
  await page.locator('.pay-card button').click();
  await page.locator('.upi button').first().click();
  await page.locator('button', { hasText: 'Use sample' }).click();
  await page.locator('button', { hasText: 'Submit for review' }).click(); await wait();
  check(`${label}: step 2 after paying`, (await step()) === 'Step 2 of 3', await step());
  await page.reload(); await wait();
  check(`${label}: step survives reload`, (await step()) === 'Step 2 of 3');
  await cta(); await wait();
  check(`${label}: guide opens Payment review`, (await page.evaluate(() => location.hash)) === '#admin/review');
  check(`${label}: guide picks the owner's payment`, (await page.locator('.split .card-head h2').nth(1).innerText()).includes('A-302'), await page.locator('.split .card-head h2').nth(1).innerText());
  await shot('3-review');
  await page.locator('button.btn.primary', { hasText: /^Approve$/ }).click();
  await page.locator('button', { hasText: 'Confirm & approve' }).click(); await wait();
  check(`${label}: step 3 after approving`, (await step()) === 'Step 3 of 3', await step());
  await cta(); await wait();
  check(`${label}: guide opens the passbook`, (await page.evaluate(() => location.hash)) === '#owner/passbook');
  await shot('4-done');
  await page.locator('.tour button[aria-label="Hide guide"]').click();
  check(`${label}: guide can be hidden`, (await page.locator('.tour').count()) === 0 && (await page.locator('.tour-pill').count()) === 1);
  await page.locator('.tour-pill').click();
  await page.locator('.tour button', { hasText: 'Start again' }).click(); await wait();
  check(`${label}: start again resets to step 1`, (await step()) === 'Step 1 of 3', await step());
  check(`${label}: saved labels choice untouched`, (await page.evaluate(() => localStorage.getItem('saral-demo:labels'))) === '1');
  await page.goto('about:blank'); await page.goto(base + '#owner/home'); await wait();
  check(`${label}: no guide without pitch`, (await page.locator('.tour, .tour-pill').count()) === 0);
  check(`${label}: labels back on without pitch`, (await page.locator('.prd-strip').count()) === 1);
  await ctx.close();
}

await loop('desktop', { width: 1400, height: 900 });
await loop('phone', { width: 390, height: 844 });
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
