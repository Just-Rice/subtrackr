// Smoke test: the app loads with no console errors at a phone and a desktop
// viewport, and the page never scrolls sideways. Serves the repo root itself.
//
//   npm i --no-save playwright && npx playwright install chromium
//   node tests/smoke.mjs
//
// The exchange-rate API is stubbed so the result doesn't depend on the network.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const viewports = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1366, height: 900 } },
};

const browser = await chromium.launch();
let failed = false;
for (const [name, opts] of Object.entries(viewports)) {
  const ctx = await browser.newContext(opts);
  await ctx.route('https://open.er-api.com/**', r => r.fulfill({ json: { rates: { USD: 1 } } }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  for (const tab of ['dashboard', 'browse', 'compare', 'settings']) {
    await page.click(`.tab[data-tab="${tab}"]`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sideways > 0) errors.push(`${tab}: page scrolls sideways by ${sideways}px`);
  }
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
  failed ||= errors.length > 0;
  await ctx.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
