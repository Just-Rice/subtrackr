#!/usr/bin/env node
/* fetch-logos.mjs — downloads the real logo of every catalogue service and card
 * issuer, once, so the app can show them without ever contacting anyone.
 *
 *   node scripts/fetch-logos.mjs                 every service and issuer
 *   node scripts/fetch-logos.mjs netflix chase   just these (service ids or issuer slugs)
 *
 * For each site it reads the homepage's <link rel="icon" | "apple-touch-icon">
 * tags and web-app manifest, tries /apple-touch-icon.png and /favicon.ico, and
 * finally Google's favicon service. Each candidate is decoded by Chromium (so
 * ICO, SVG, WebP and PNG all work), drawn onto a 96×96 transparent square and
 * saved as PNG in logos/. js/data/logos.js is rewritten to list the files.
 *
 * Needs Playwright with Chromium (npm i -g playwright && npx playwright install
 * chromium). Not part of the app or its tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'logos');
const SIZE = 96;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

/* a site whose own icons are missing, tiny or blocked → a better source: a URL,
   or { simpleIcons: slug } for the CC0 Simple Icons set, drawn in its brand colour */
const SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@16.36.0';
const OVERRIDES = {
  copilot: 'https://github.githubassets.com/apple-touch-icon-180x180.png',
  visible: 'https://www.visible.com/content/dam/value/visible/icons/visiblelogo.svg',
  vodafoneuk: { simpleIcons: 'vodafone' },
  verizon: { simpleIcons: 'verizon' },
  fios: { simpleIcons: 'verizon' },
  paramountplus: { simpleIcons: 'paramountplus' },
  dashpass: { simpleIcons: 'doordash' },
  airtel: { simpleIcons: 'airtel' },
  airtelfiber: { simpleIcons: 'airtel' },
  'HDFC Bank': { simpleIcons: 'hdfcbank' },
  'Axis Bank': { simpleIcons: 'axisbank' }
};

function loadData() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/data/regions.js', 'js/data/catalog.js', 'js/data/cards.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { catalog: vm.runInContext('CATALOG', ctx), cards: vm.runInContext('CARDS', ctx) };
}

export const issuerSlug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const host = site => String(site || '').replace(/^https?:\/\//, '').split('/')[0];

function targets(only) {
  const { catalog, cards } = loadData();
  const list = catalog.filter(s => s.site).map(s => ({ key: s.id, file: s.id + '.png', site: host(s.site), name: s.name, kind: 'service' }));
  const issuers = new Map();
  cards.forEach(c => { if (c.site && !issuers.has(c.issuer)) issuers.set(c.issuer, host(c.site)); });
  issuers.forEach((site, issuer) => list.push({ key: issuer, file: 'issuer-' + issuerSlug(issuer) + '.png', site, name: issuer, kind: 'issuer' }));
  return only.length ? list.filter(t => only.includes(t.key) || only.includes(issuerSlug(t.key))) : list;
}

async function get(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok) return null;
    return { url: res.url, type: res.headers.get('content-type') || '', body: Buffer.from(await res.arrayBuffer()) };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* the icon links a page declares, best first */
function iconLinks(html, base) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = (/\brel\s*=\s*["']?([^"'>]+)/i.exec(tag) || [])[1] || '';
    const href = (/\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag) || [])[1];
    if (!href || !/icon|manifest/i.test(rel)) continue;
    const sizes = (/\bsizes\s*=\s*["']?([^"'>]+)/i.exec(tag) || [])[1] || '';
    let abs;
    try { abs = new URL(href.replace(/&amp;/g, '&'), base).href; } catch (e) { continue; }
    if (/manifest/i.test(rel)) { out.push({ url: abs, manifest: true }); continue; }
    const px = Math.max(0, ...sizes.split(/\s+/).map(s => parseInt(s, 10) || 0));
    const svg = /\.svg(\?|$)/i.test(abs) || /svg/i.test(tag);
    const score = (/apple-touch/i.test(rel) ? 300 : 0) + (svg ? 250 : 0) + Math.min(px, 512) - (/mask-icon/i.test(rel) ? 400 : 0);
    out.push({ url: abs, score });
  }
  return out;
}

async function manifestIcons(url) {
  const r = await get(url);
  if (!r) return [];
  try {
    const m = JSON.parse(r.body.toString('utf8'));
    return (m.icons || []).map(i => ({
      url: new URL(i.src, r.url).href,
      score: 200 + Math.min(512, Math.max(0, ...String(i.sizes || '').split(/\s+/).map(s => parseInt(s, 10) || 0))) - (/monochrome/.test(i.purpose || '') ? 400 : 0)
    }));
  } catch (e) { return []; }
}

async function candidates(site) {
  const list = [];
  /* some sites only answer on www., or the other way round */
  const hosts = site.startsWith('www.') ? [site, site.slice(4)] : [site, 'www.' + site];
  for (const h of hosts) {
    const page = await get('https://' + h + '/');
    if (page && /html/i.test(page.type)) {
      for (const l of iconLinks(page.body.toString('utf8'), page.url)) {
        if (l.manifest) list.push(...await manifestIcons(l.url)); else list.push(l);
      }
      if (list.length) break;
    }
  }
  hosts.forEach(h => {
    list.push({ url: 'https://' + h + '/apple-touch-icon.png', score: 150 });
    list.push({ url: 'https://' + h + '/favicon.ico', score: 20 });
  });
  list.sort((a, b) => b.score - a.score);
  /* icon services, for sites that turn scripts away; used only when they give a real logo */
  list.push({ url: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://' + site + '&size=256', score: 0, fallback: true });
  list.push({ url: 'https://www.google.com/s2/favicons?domain=' + site + '&sz=128', score: 0, fallback: true });
  list.push({ url: 'https://icons.duckduckgo.com/ip3/' + site + '.ico', score: 0, fallback: true });
  const seen = new Set();
  return list.filter(c => !seen.has(c.url) && seen.add(c.url));
}

/* decode in Chromium, centre on a transparent square, reject tiny or blank images */
async function render(page, bytes, mime) {
  return page.evaluate(async ({ b64, mime, size }) => {
    const img = new Image();
    img.src = 'data:' + mime + ';base64,' + b64;
    try { await img.decode(); } catch (e) { return { error: 'undecodable' }; }
    const svg = /svg/.test(mime);
    const w = img.naturalWidth || (svg ? size : 0), h = img.naturalHeight || (svg ? size : 0);
    if (!svg && Math.min(w, h) < 30) return { error: 'too small (' + w + 'px)' };
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const k = Math.min(size / w, size / h);
    g.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
    const px = g.getImageData(0, 0, size, size).data;
    let seen = 0;
    for (let i = 0; i < px.length; i += 16) if (px[i + 3] > 24) seen++;
    /* a logo that is all white would vanish on the white tile */
    if (seen < 40) return { error: 'blank' };
    let dark = 0;
    for (let i = 0; i < px.length; i += 16) {
      if (px[i + 3] > 24 && 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] < 225) dark++;
    }
    if (dark < 20) return { error: 'white only' };
    return { png: c.toDataURL('image/png').split(',')[1], w, h };
  }, { b64: bytes.toString('base64'), mime, size: SIZE });
}

function mimeOf(r) {
  if (/svg/i.test(r.type) || /\.svg(\?|$)/i.test(r.url)) return 'image/svg+xml';
  if (/icon|\.ico(\?|$)/i.test(r.type + ' ' + r.url)) return 'image/x-icon';
  if (/webp/i.test(r.type)) return 'image/webp';
  if (/jpe?g/i.test(r.type)) return 'image/jpeg';
  if (/gif/i.test(r.type)) return 'image/gif';
  return 'image/png';
}

let siColours = null;
async function simpleIcon(slug) {
  if (!siColours) {
    const r = await get(SIMPLE_ICONS + '/data/simple-icons.json', 60000);
    const data = r ? JSON.parse(r.body.toString('utf8')) : [];
    siColours = new Map((Array.isArray(data) ? data : data.icons || []).map(i => [i.slug, i.hex]));
  }
  const r = await get(SIMPLE_ICONS + '/icons/' + slug + '.svg');
  if (!r) return null;
  const hex = siColours.get(slug) || '111316';
  return { url: r.url, type: 'image/svg+xml', body: Buffer.from(r.body.toString('utf8').replace('<svg ', '<svg fill="#' + hex + '" ')) };
}

/* what the icon services send for a site they know nothing about */
let generic = null;
async function genericIcons() {
  if (!generic) {
    generic = new Set();
    for (const c of (await candidates('no-such-site.invalid')).filter(c => c.fallback)) {
      const r = await get(c.url);
      if (r) generic.add(r.body.toString('base64'));
    }
  }
  return generic;
}

async function fetchOne(page, t) {
  const tried = [];
  const o = OVERRIDES[t.key];
  const list = o ? [{ url: typeof o === 'string' ? o : 'simple-icons:' + o.simpleIcons, si: o.simpleIcons, score: 999 }] : await candidates(t.site);
  for (const c of list) {
    const r = c.si ? await simpleIcon(c.si) : await get(c.url);
    if (!r || !r.body.length || /html/i.test(r.type)) { tried.push(c.url + ' (no image)'); continue; }
    if (c.fallback && (await genericIcons()).has(r.body.toString('base64'))) { tried.push(c.url + ' (generic)'); continue; }
    const out = await render(page, r.body, mimeOf(r));
    if (out.error) { tried.push(c.url + ' (' + out.error + ')'); continue; }
    fs.writeFileSync(path.join(OUT, t.file), Buffer.from(out.png, 'base64'));
    return { ok: true, from: c.url };
  }
  return { ok: false, tried };
}

function writeIndex() {
  const { catalog, cards } = loadData();
  const services = catalog.filter(s => fs.existsSync(path.join(OUT, s.id + '.png'))).map(s => '  ' + JSON.stringify(s.id) + ': ' + JSON.stringify('logos/' + s.id + '.png'));
  const issuers = [...new Set(cards.map(c => c.issuer))].filter(i => fs.existsSync(path.join(OUT, 'issuer-' + issuerSlug(i) + '.png')))
    .map(i => '  ' + JSON.stringify(i) + ': ' + JSON.stringify('logos/issuer-' + issuerSlug(i) + '.png'));
  fs.writeFileSync(path.join(ROOT, 'js/data/logos.js'),
    '/* logos.js — written by scripts/fetch-logos.mjs; run it again rather than editing.\n' +
    ' * Each entry is a logo bundled with the app, so showing it never contacts anyone.\n' +
    ' * The logos are trademarks of their owners, shown only to identify the service. */\n\n' +
    'const LOGOS = {\n' + services.join(',\n') + '\n};\n\n' +
    'const ISSUER_LOGOS = {\n' + issuers.join(',\n') + '\n};\n');
  return { services: services.length, issuers: issuers.length };
}

async function main() {
  const only = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = await import('playwright')); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>logos</title>');
  const list = targets(only);
  const misses = [];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const t = list[i++];
      const r = await fetchOne(page, t);
      process.stdout.write((r.ok ? 'ok   ' : 'MISS ') + t.kind + ' ' + t.key + (r.ok ? '  ← ' + r.from : '') + '\n');
      if (!r.ok) misses.push(t.key + ' (' + t.site + '): ' + r.tried.join('; '));
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  await browser.close();
  const n = writeIndex();
  console.log('\n' + n.services + ' service logos and ' + n.issuers + ' issuer logos listed in js/data/logos.js');
  if (misses.length) console.log('\nNo usable logo found — add an OVERRIDES entry:\n' + misses.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
