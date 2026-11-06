// Checks the example client preset: branding, switched-off features, PRD override, reset, bad names.
// Usage: node presets.mjs <siteDir> [shotDir]
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
const check = (name, ok, extra = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const shot = async (n) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, n + '.png') }); };
const go = async (q) => { await page.goto('about:blank'); await page.goto(base + q); await page.waitForTimeout(500); };
const text = (sel) => page.locator(sel).first().innerText();

await go('?client=example');
check('login hides guard when gate is off', (await page.locator('.persona').count()) === 3, String(await page.locator('.persona').count()));
check('badge names the preset', (await text('.data-badge')).includes('Green Valley Heights'));

await go('?client=example#admin/dashboard');
check('sidebar uses preset society', (await text('.soc')).includes('Green Valley Heights') && (await text('.soc')).includes('Kothrud, Pune'), await text('.soc'));
const nav = await page.locator('.side nav button').allInnerTexts();
check('amenities and visitor log hidden', !nav.some((t) => /Amenity|Visitor/.test(t)), nav.join('|'));
check('notices still shown', nav.some((t) => t.includes('Notices')));
check('notices tagged Requested', nav.find((t) => t.includes('Notices')).includes('Requested'));
check('dashboard has no booking items', (await page.locator('.queue .qi', { hasText: 'Booking request' }).count()) === 0);
await shot('preset-admin-dashboard');
await go('?client=example#admin/amenities');
check('hidden page link falls back to dashboard', (await text('.crumb')).includes('Dashboard'));
await go('?client=example#admin/notices');
check('notices crumb shows override', (await text('.crumb .prd-tag')).includes('Requested'));
await go('?client=example#admin/receipts');
await page.locator('table.t tbody tr.click').first().click(); await page.waitForTimeout(150);
check('receipt stamp uses preset', (await text('.receipt .stamp')).includes('GREEN VALLEY'));
check('receipt header uses preset name', (await text('.receipt .rh')).includes('Green Valley Heights Co-operative'));

await go('?client=example#guard/gate');
check('guard link unavailable when gate is off', (await page.locator('.persona').count()) === 3);

await go('?client=example#owner/home');
const tiles = await page.locator('.tiles button').allInnerTexts();
check('tiles: credit and complaint only', tiles.length === 2, tiles.join('|'));
const tabs = await page.locator('.tabbar button').allInnerTexts();
check('no Gate pass tab', tabs.length === 4 && !tabs.some((t) => t.includes('Gate')), tabs.join('|'));
check('resident header uses preset', (await page.locator('.app-head').innerText()).length > 0);
check('no coming-up section', (await page.locator('.sec-title', { hasText: 'Coming up' }).count()) === 0);
await shot('preset-owner-home');
await page.locator('.pay-card button').click(); await page.waitForTimeout(150);
check('pay sheet shows preset UPI id', (await page.locator('.sheet').innerText()).includes('greenvalley.demo@upi'));
await page.locator('.upi button').first().click(); await page.locator('button', { hasText: 'Use sample' }).click(); await page.waitForTimeout(150);
const src = await page.locator('.upload img').getAttribute('src');
check('sample screenshot pays the preset society', decodeURIComponent(src).includes('Green Valley Heights CHS'));
await page.locator('.sheet [aria-label="Close"]').click();
await page.locator('.tabbar button', { hasText: 'Requests' }).click(); await page.waitForTimeout(100);
check('requests: complaints only, no segment switch', (await page.locator('.app-body .seg').count()) === 0 && (await page.locator('.app-body button', { hasText: 'Raise a complaint' }).count()) === 1);
await page.locator('.tabbar button', { hasText: 'Profile' }).click(); await page.waitForTimeout(100);
await page.locator('.res-side button', { hasText: 'Reset demo' }).click();
await page.locator('button', { hasText: 'Reset all demo data' }).click(); await page.waitForTimeout(400);
await page.locator('.tabbar button', { hasText: 'Passbook' }).click(); await page.waitForTimeout(100);
check('reset keeps preset branding', (await page.locator('.app-head').innerText()).includes('Green Valley Heights'), await page.locator('.app-head').innerText());

await go('#admin/dashboard');
check('no preset: default society back', (await text('.soc')).includes('Aldgate Residency'));
check('no preset: amenities shown', (await page.locator('.side nav button', { hasText: 'Amenity' }).count()) === 1);

await go('?client=nope');
check('unknown preset explains itself', (await page.locator('#root').innerText()).includes('no client preset called “nope”'));
await go('?client=..%2Fdb');
check('invalid preset name rejected', (await page.locator('#root').innerText()).includes('isn’t a valid client name'));

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close(); server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
