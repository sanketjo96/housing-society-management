// Makes the link-preview images (what WhatsApp, LinkedIn, Slack etc. show
// when someone shares a link): website/preview.jpg for the landing page and
// demo/preview.jpg for the demo, both 1200x630, from the real pages.
//
// Run from the repo root after a visible design change, then commit the images:
//   node website/make-previews.mjs
// Needs Playwright from e2e/ (cd e2e && npm ci) and a network connection
// (fonts and React load from CDNs).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = require('playwright');

const repo = path.resolve(new URL('..', import.meta.url).pathname);
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'saral-site-'));
execFileSync(path.join(repo, 'website/build.sh'), [site], { stdio: 'ignore' });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' });
const shot = (file, opts = {}) => page.screenshot({ path: file, type: 'jpeg', quality: 86, ...opts });

// Landing page: the hero as it is.
await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
await shot(path.join(repo, 'website/preview.jpg'));

// Demo: Priya's phone screen on a branded card.
await page.setViewportSize({ width: 1400, height: 1000 });
await page.goto(base + '/demo/?labels=0#owner/home', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
const phone = (await page.locator('.device').first().screenshot({ type: 'png' })).toString('base64');
await page.setViewportSize({ width: 1200, height: 630 });
const logo = fs.readFileSync(path.join(repo, 'website/favicon.svg'), 'utf8');
await page.setContent(`<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&family=Hanken+Grotesk:wght@400;500;600&display=swap">
<style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: radial-gradient(900px 500px at 85% 20%, #2a3b35, #182420 60%); color: #E9EDE6; font-family: "Hanken Grotesk", sans-serif; display: flex; }
  .l { flex: 1; padding: 64px 0 0 72px; display: flex; flex-direction: column; }
  .brand { display: flex; gap: 12px; align-items: center; font-family: "Source Serif 4", serif; font-size: 30px; }
  .brand svg { width: 40px; height: 40px; }
  .eyebrow { margin-top: 64px; font-size: 16px; letter-spacing: .14em; text-transform: uppercase; color: #D2A35A; font-weight: 600; }
  h1 { margin: 14px 0 0; font-family: "Source Serif 4", serif; font-weight: 400; font-size: 64px; line-height: 1.05; letter-spacing: -.01em; }
  h1 i { color: #F1D9AE; }
  p { margin: 22px 0 0; font-size: 22px; color: #B9C3BC; line-height: 1.45; max-width: 560px; }
  .r { width: 470px; position: relative; }
  .r img { position: absolute; top: 40px; left: 40px; width: 360px; border-radius: 46px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.6); }
</style></head><body>
  <div class="l"><div class="brand">${logo}Saral Society</div>
    <div class="eyebrow">Live demo · no sign-up</div>
    <h1>Pay, approve,<br><i>receipt.</i></h1>
    <p>Try the whole maintenance loop as a resident and as the treasurer, right in your browser.</p></div>
  <div class="r"><img src="data:image/png;base64,${phone}"></div>
</body></html>`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await shot(path.join(repo, 'demo/preview.jpg'));

await browser.close(); server.close(); fs.rmSync(site, { recursive: true, force: true });
console.log('Wrote website/preview.jpg and demo/preview.jpg');
