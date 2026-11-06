// Checks deep links, hash changes, legacy links, and the PRD labels toggle.
// Usage: node routes.mjs <siteDir> [shotDir]
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (name, ok, extra = '') => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };
const hash = () => page.evaluate(() => location.hash);
const shot = async (n) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, n + '.png') }); };
const go = async (h) => { await page.goto('about:blank'); await page.goto(base + h); await page.waitForTimeout(400); };

await go('#owner/passbook');
check('owner deep link opens passbook', (await page.locator('.tabbar button.on').innerText()).includes('Passbook'), await hash());
check('owner link keeps hash', (await hash()) === '#owner/passbook');
check('resident strip label shown', (await page.locator('.prd-strip .prd-tag').innerText()).includes('7.4'));
check('resident tile labels hidden on passbook (not home)', (await page.locator('.tiles').count()) === 0);
await page.locator('.tabbar button', { hasText: 'Home' }).click(); await page.waitForTimeout(100);
check('tab click updates hash', (await hash()) === '#owner/home', await hash());
const tileTags = await page.locator('.tiles .prd-tag').allInnerTexts();
check('home tiles: non-built features tagged', JSON.stringify(tileTags) === JSON.stringify(['Designed', 'New', 'New']), JSON.stringify(tileTags));
await shot('owner-home-labels');

await go('#tenant/requests/bookings');
check('tenant bookings sub-tab', (await page.locator('.seg button.on').innerText()).includes('Amenity'), await hash());
check('bookings label is 7.14', (await page.locator('.prd-strip .prd-tag').innerText()).includes('7.14'));
await page.locator('.seg button', { hasText: 'Complaints' }).click(); await page.waitForTimeout(100);
check('sub-tab change updates hash', (await hash()) === '#tenant/requests', await hash());

await go('#guard/verify');
check('guard deep link opens verify', (await page.locator('.tabbar button.on').innerText()).includes('Verify'));
await shot('guard-verify-labels');

await go('#billing');
check('legacy #billing opens admin billing', (await page.locator('.crumb').innerText()).includes('Billing'));
check('legacy link rewritten to #admin/billing', (await hash()) === '#admin/billing', await hash());
const navTags = await page.locator('.side .nav .prd-tag').allInnerTexts();
check('admin nav tags only non-built', JSON.stringify(navTags) === JSON.stringify(['Designed', 'New', 'New', 'New', 'Partly built']), JSON.stringify(navTags));
check('admin crumb label', (await page.locator('.crumb .prd-tag').innerText()).includes('§7.3'));
await shot('admin-billing-labels');

await page.locator('.side nav button', { hasText: 'Dashboard' }).click(); await page.waitForTimeout(100);
check('nav click updates hash', (await hash()) === '#admin/dashboard');
await page.evaluate(() => { location.hash = '#admin/billing'; }); await page.waitForTimeout(300);
check('re-opening same link moves page back', (await page.locator('.crumb').innerText()).includes('Billing'));
await page.evaluate(() => { location.hash = '#owner/gate'; }); await page.waitForTimeout(300);
check('hash change switches persona', (await page.locator('.tabbar button.on').innerText()).includes('Gate'));

await go('#admin/nonsense');
check('unknown screen falls back to dashboard', (await page.locator('.crumb').innerText()).includes('Dashboard'), await hash());
await go('#nobody/home');
check('unknown persona shows login', (await page.locator('.persona').count()) === 4);

await go('#admin/notices');
await page.locator('.data-badge .lbl-toggle').click(); await page.waitForTimeout(100);
check('toggle hides labels', (await page.locator('.prd-tag').count()) === 0);
await page.reload(); await page.waitForTimeout(400);
check('labels off remembered after reload', (await page.locator('.prd-tag').count()) === 0);
await page.goto(base + '?labels=1#admin/notices'); await page.waitForTimeout(400);
check('?labels=1 turns them on', (await page.locator('.prd-tag').count()) > 0);
await page.locator('[aria-label="Log out"]').click(); await page.waitForTimeout(100);
check('logout clears hash', (await hash()) === '' && (await page.locator('.persona').count()) === 4, await hash());

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
