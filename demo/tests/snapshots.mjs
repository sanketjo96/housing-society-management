// Walks every screen, popup and cross-persona flow and writes one DOM snapshot each.
// Take one before a change and one after, then diff the two folders: any difference
// is a real change, because the clock and random numbers are fixed.
// Usage: node snapshots.mjs <siteDir> <outDir> [startPath, default '/demo/?labels=0']
// Deterministic: Date fixed to 2026-11-03 10:00 local, Math.random seeded.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../e2e/package.json', import.meta.url)); // Playwright comes from e2e/
const { chromium } = require('playwright');

const [siteDir, outDir, startPath = '/demo/?labels=0'] = process.argv.slice(2);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(path.resolve(siteDir), p);
  if (!f.startsWith(path.resolve(siteDir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  const FIXED = new Date(2026, 10, 3, 10, 0, 0).getTime();
  const RD = Date;
  // eslint-disable-next-line no-global-assign
  Date = class extends RD { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } };
  let s = 42; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  try { localStorage.clear(); } catch (e) {}
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let n = 0;
async function snap(name) {
  await page.waitForTimeout(60);
  const htmlStr = await page.evaluate(() => {
    const root = document.getElementById('root').cloneNode(true);
    root.querySelectorAll('.toast-zone, .data-badge').forEach((x) => x.remove());
    return root.innerHTML;
  });
  n++;
  fs.writeFileSync(path.join(outDir, String(n).padStart(3, '0') + '-' + name.replace(/[^a-z0-9]+/gi, '_') + '.html'), htmlStr.replace(/></g, '>\n<'));
}
async function login(nameRe) {
  await page.goto(base + startPath);
  try { await page.waitForSelector('.persona', { timeout: 8000 }); }
  catch (e) { console.log('Demo did not load:', errors, (await page.locator('body').innerText()).slice(0, 400)); throw e; }
  await snap('login');
  await page.locator('.persona', { hasText: nameRe }).click();
}
const closeTop = async () => { await page.keyboard.press('Escape'); const x = page.locator('.sheet [aria-label="Close"], .modal [aria-label="Close"], .drawer [aria-label="Close"]'); if (await x.count()) await x.first().click(); };

// ---- Admin
await login(/Sanjay/);
await page.waitForSelector('.side nav');
const navCount = await page.locator('.side nav button').count();
for (let i = 0; i < navCount; i++) {
  const b = page.locator('.side nav button').nth(i);
  const label = (await b.innerText()).split('\n')[0];
  await b.click();
  await snap('admin-' + label);
}
await page.locator('.side nav button', { hasText: 'Dashboard' }).click();
await page.locator('table.t tbody tr.click').first().click(); await snap('admin-flat-drawer');
for (const t of ['Details', 'Occupancy history']) { await page.locator('.drawer .chip', { hasText: t }).click(); await snap('admin-flat-drawer-' + t); }
await closeTop();
await page.locator('.side nav button', { hasText: 'Flats' }).click();
await page.locator('button', { hasText: 'Add flat' }).click(); await snap('admin-add-flat'); await closeTop();
await page.locator('button', { hasText: 'Bulk import' }).click(); await snap('admin-import-1');
await page.locator('button', { hasText: 'Use sample file' }).click(); await snap('admin-import-2'); await closeTop();
await page.locator('.side nav button', { hasText: 'Receipts' }).click();
await page.locator('table.t tbody tr.click').first().click(); await snap('admin-receipt-modal'); await closeTop();
await page.locator('.side nav button', { hasText: 'Payment review' }).click();
await page.locator('button', { hasText: 'Record cash or cheque' }).click(); await snap('admin-manual'); await closeTop();
await page.locator('.card-pad .actions button', { hasText: 'Approve' }).click(); await snap('admin-approve-modal'); await closeTop();
await page.locator('.side nav button', { hasText: 'Billing' }).click();
await page.locator('button', { hasText: 'Generate November charges' }).click(); await snap('admin-billing-confirm');
await page.locator('button', { hasText: 'Generate charges' }).click(); await snap('admin-billing-done');
await page.locator('.side nav button', { hasText: 'Complaints' }).click();
await page.locator('.ticket').first().click(); await snap('admin-complaint-modal'); await closeTop();
await page.locator('.side nav button', { hasText: 'Notices' }).click();
await page.locator('button', { hasText: 'New notice' }).click(); await snap('admin-notice-modal'); await closeTop();
await page.locator('.side nav button', { hasText: 'Expenses' }).click();
await page.locator('button', { hasText: 'Add expense' }).click(); await snap('admin-expense-modal'); await closeTop();
await page.locator('.side nav button', { hasText: 'Notifications' }).click();
await page.locator('.metric.hero button').first().click(); await snap('admin-buy-credits'); await closeTop();

// ---- Owner and tenant
for (const who of [/Priya/, /Arjun/]) {
  await login(who);
  await page.waitForSelector('.tabbar');
  const tabs = await page.locator('.tabbar button').count();
  for (let i = 0; i < tabs; i++) { const b = page.locator('.tabbar button').nth(i); const l = await b.innerText(); await b.click(); await snap('res-' + who.source + '-' + l); }
  await page.locator('.tabbar button').first().click();
  for (const t of ['Add credit', 'Complaint', 'Book', 'Gate pass']) {
    await page.locator('.tiles button', { hasText: t }).click(); await snap('res-' + who.source + '-sheet-' + t); await closeTop();
    await page.locator('.tabbar button').first().click();
  }
  await page.locator('.list button.li').first().click(); await snap('res-' + who.source + '-notice'); await closeTop();
  await page.locator('.tabbar button', { hasText: 'Requests' }).click();
  await page.locator('.seg button', { hasText: 'Amenity bookings' }).click(); await snap('res-' + who.source + '-bookings');
  await page.locator('.tabbar button', { hasText: 'Gate pass' }).click();
  if (await page.locator('button.pass').count()) { await page.locator('button.pass').first().click(); await snap('res-' + who.source + '-passview'); await closeTop(); }
  await page.locator('.tabbar button', { hasText: 'Passbook' }).click();
  for (const c of ['Charges', 'Payments', 'Credits']) { await page.locator('.app-body .chip', { hasText: c }).click(); await snap('res-' + who.source + '-pb-' + c); }
}

// ---- Guard
await login(/Ramesh/);
await page.waitForSelector('.tabbar');
const gt = await page.locator('.tabbar button').count();
for (let i = 0; i < gt; i++) { const b = page.locator('.tabbar button').nth(i); const l = await b.innerText(); await b.click(); await snap('guard-' + l); }
await page.locator('.tabbar button').first().click();
await page.locator('.big-act button', { hasText: 'Walk-in' }).click(); await snap('guard-walkin'); await closeTop();
await page.locator('.tabbar button', { hasText: 'Verify' }).click();
await page.locator('button', { hasText: 'Scan QR code' }).click(); await snap('guard-scan');
if (await page.locator('.sheet .list button.li').count()) { await page.locator('.sheet .list button.li').first().click(); await snap('guard-scanned'); }

// ---- Cross-persona flow 1: owner pays, admin approves, tenant sees receipt
await login(/Priya/);
await page.waitForSelector('.pay-card');
await page.locator('.pay-card button').click(); await snap('flow-pay-sheet');
await page.locator('.upi button').first().click(); await snap('flow-intent');
await page.locator('button', { hasText: 'Use sample' }).click();
await page.fill('#pay-utr', '630611112222');
await snap('flow-proof');
await page.locator('button', { hasText: 'Submit for review' }).click(); await snap('flow-submitted');
await page.locator('.switch-list button', { hasText: 'Sanjay' }).click();
await page.locator('.side nav button', { hasText: 'Payment review' }).click();
await page.locator('.queue .qi', { hasText: 'Priya' }).first().click(); await snap('flow-review');
await page.locator('.card-pad .actions button', { hasText: 'Approve' }).click();
await page.locator('button', { hasText: 'Confirm & approve' }).click(); await snap('flow-approved');
await page.locator('[aria-label="Log out"]').click();
await page.locator('.persona', { hasText: /Arjun/ }).click();
await page.waitForSelector('.tabbar'); await snap('flow-tenant-home');

// ---- Flow 2: gate pass created by owner, verified by guard
await login(/Priya/);
await page.locator('.tiles button', { hasText: 'Gate pass' }).click();
await page.fill('#gp-name', 'Kavya Iyer');
await page.locator('.sheet-foot button', { hasText: 'Create pass' }).click(); await snap('flow2-pass');
const code = (await page.locator('.sheet .code').innerText()).trim();
await closeTop();
await page.locator('.switch-list button', { hasText: 'Ramesh' }).click();
await page.locator('.tabbar button', { hasText: 'Verify' }).click();
for (const d of code) await page.locator('.keypad button', { hasText: new RegExp('^' + d + '$') }).click();
await snap('flow2-verified');
await page.locator('button', { hasText: 'Let in' }).click(); await snap('flow2-let-in');

console.log(JSON.stringify({ snapshots: n, errors }, null, 1));
await browser.close(); server.close();
