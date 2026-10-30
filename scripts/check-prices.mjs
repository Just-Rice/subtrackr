#!/usr/bin/env node
/* check-prices.mjs — the monthly price check. Gemini reads each provider's own
 * pricing page (the free url_context tool; Google Search grounding needs a
 * billed project) for the current list price of every catalogue plan and the
 * current terms of every built-in card, keeps the answers that pass the
 * guardrails in scripts/lib/price-review.mjs, writes them into
 * js/data/catalog.js and js/data/cards.js, and writes a Markdown report for the
 * pull request.
 *
 * Which page to read is remembered in scripts/data/pricing-pages.json. A
 * market without one gets a page suggested by Gemini first, kept only when it
 * is on the provider's own website; a page that is read and shows prices is
 * saved for next time, one that can't be read or shows none is dropped.
 * Services and cards whose prices were checked longest ago go first, so a run
 * cut short by the free allowance still reaches the stalest ones.
 *
 *   GEMINI_API_KEY=… node scripts/check-prices.mjs [options]
 *     --only netflix,amex-gold   just these services or cards
 *     --services | --cards       just one kind
 *     --dry-run                  report only; change no files
 *     --report <file>            where the report goes (default price-report.md)
 *     --limit <n>                stop after n requests
 *     --probe                    just test which Gemini features this key can use
 *                                (plain answers, Google Search, reading a page) on
 *                                each model, and report what Google says
 *
 * Every request goes to the best model in js/data/gemini-models.js that still
 * has allowance and moves down the list as each runs out (js/core/gemini.js).
 * Run by .github/workflows/prices.yml on the 1st of each month.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as P from './lib/patch-catalog.mjs';
import { review, domainOf, isOfficial } from './lib/price-review.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_FILE = path.join(ROOT, 'js/data/catalog.js');
const CARDS_FILE = path.join(ROOT, 'js/data/cards.js');
const PAGES_FILE = process.env.PRICING_PAGES_FILE || path.join(ROOT, 'scripts/data/pricing-pages.json');
const PACE_MS = Number(process.env.GEMINI_PACE_MS || 13000);   /* ~4.6 a minute: under the Flash free limit */

function args(argv) {
  const o = { only: [], dryRun: false, report: 'price-report.md', limit: Infinity, services: true, cards: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--report') o.report = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--services') o.cards = false;
    else if (a === '--cards') o.services = false;
    else if (a === '--probe') o.probe = true;
  }
  return o;
}

/* the app's own data files and Gemini helper, loaded the way the browser does */
function loadApp(catalogSrc, cardsSrc) {
  const store = new Map();
  const base = process.env.GEMINI_API_BASE;      /* tests point this at a local stand-in for Gemini */
  const ctx = {
    console, Intl, Date, URL, AbortSignal,
    fetch: base ? (url, init) => fetch(String(url).replace('https://generativelanguage.googleapis.com', base), init) : fetch,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = (file, text) => vm.runInContext(text ?? fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  run('js/data/regions.js');
  run('js/data/catalog.js', catalogSrc);
  run('js/data/cards.js', cardsSrc);
  run('js/data/gemini-models.js');
  run('js/core/gemini.js');
  return { G: ctx.ST.gemini, catalog: vm.runInContext('CATALOG', ctx), cards: vm.runInContext('CARDS', ctx), regions: vm.runInContext('REGION_BY_CODE', ctx),
           models: vm.runInContext('GEMINI_MODELS', ctx) };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const oneLine = e => String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 300);
const round = (v, cur) => (['JPY', 'INR', 'KRW'].includes(cur) ? Math.round(v) : Math.round(v * 100) / 100);

function readPages() {
  try { const o = JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

/* the markets a service carries prices for */
function marketsOf(svc) {
  const out = new Set();
  svc.tiers.forEach(t => Object.keys((t.billedYearly && t.y ? t.y : t.m) || {}).forEach(m => out.add(m)));
  return [...out];
}

/* the oldest "last checked" month: never checked sorts first */
function staleness(asOf, markets) {
  if (typeof asOf === 'string') return asOf;
  return (markets || []).map(m => (asOf && asOf[m]) || '0000-00').sort()[0] || '0000-00';
}

/* ── prompts ── */

const RULES = [
  'Reply with JSON only, no prose and no Markdown.',
  'Only the items listed: never add plans, markets, cards or credits.',
  'amount is the number alone, in the currency given — never convert currencies.',
  'Use only what the pages listed above show, never your own knowledge: use null for anything the page for that market does not show.',
  'source is the URL, from the list above, of the page that shows the figure.',
  'Put new or discontinued plans, credits or offers, and anything else worth a human look, in notes.'
].join(' ');

/* where to read: the provider's own page per market */
function pagesPrompt(company, site, what, markets, regions) {
  return 'For each market below, give the official web page on ' + company + '’s own website (' + site + ') that shows ' + what + '. ' +
    'Prefer the page for that country (a country path or domain where one exists). Use null when you don’t know one. ' +
    'Reply with JSON only: {"pages":{"US":"https://…"}}.\n' +
    markets.map(m => '- ' + m + ' (' + ((regions[m] || {}).name || m) + ')').join('\n');
}

function servicePrompt(svc, regions, today, pages) {
  const lines = [], markets = new Set();
  svc.tiers.forEach(t => {
    const yearly = t.billedYearly && t.y;
    const prices = yearly ? t.y : t.m;
    Object.keys(prices || {}).forEach(code => {
      const cur = (regions[code] || {}).cur;
      if (!cur || !pages[code]) return;
      markets.add(code);
      lines.push('- tier "' + t.name + '", market ' + code + ' (' + regions[code].name + '), ' + cur + ' per ' +
        (yearly ? 'year' : t.cycle === 'fourweekly' ? '28 days' : t.cycle === 'yearly' ? 'year' : 'month') + ': currently ' + prices[code]);
    });
  });
  return {
    lines: lines.length,
    text: 'Today is ' + today + '. You are checking list prices for a subscription-price tracker.\n' +
      'Read these pages and report the CURRENT advertised price that a new customer pays for each plan below, in each market, ' +
      'in that market\'s local currency, including tax where the page shows prices that way.\n\n' +
      'Service: ' + svc.name + ' (' + svc.company + ', ' + svc.site + ')\nPages:\n' +
      [...markets].map(m => '- ' + m + ': ' + pages[m]).join('\n') + '\n\nPlans:\n' + lines.join('\n') + '\n\n' +
      'Answer as {"prices":[{"tier":"…","market":"US","amount":12.99,"source":"https://…"}],"notes":["…"]}. ' + RULES
  };
}

function cardPrompt(card, today, page) {
  const credits = card.credits.map(c => '- credit "' + c.id + '" (' + c.name + '): currently ' + c.amount + ' ' + card.cur + ' per ' + c.cadence).join('\n');
  return 'Today is ' + today + '. You are checking credit card terms for a card-value tracker.\n' +
    'Read this page and report the CURRENT published terms of this card for new applicants in ' + card.market + ':\n- ' + page + '\n\n' +
    'Card: ' + card.name + ' by ' + card.issuer + ' (' + card.site + ')\n' +
    '- annual fee: currently ' + card.fee + ' ' + card.cur + '\n' +
    (card.bonus ? '- welcome offer: currently ' + card.bonus.amount + ' ' + card.unit + ' after spending ' + card.bonus.spend + ' ' + card.cur + ' in ' + card.bonus.months + ' months\n' : '') +
    (credits ? credits + '\n' : '') + '\n' +
    'Answer as {"fee":{"amount":0,"source":"https://…"},"bonus":{"amount":0,"spend":0,"months":0,"source":"https://…"},' +
    '"credits":[{"id":"…","amount":0,"source":"https://…"}],"notes":["…"]}. Use the highest generally advertised welcome offer. ' + RULES;
}

const SCHEMA = {
  type: 'object',
  properties: {
    prices: { type: 'array', items: { type: 'object', properties: { tier: { type: 'string' }, market: { type: 'string' }, amount: { type: 'number', nullable: true }, source: { type: 'string' } } } },
    fee: { type: 'object', properties: { amount: { type: 'number', nullable: true }, source: { type: 'string' } } },
    bonus: { type: 'object', properties: { amount: { type: 'number', nullable: true }, spend: { type: 'number', nullable: true }, months: { type: 'number', nullable: true }, source: { type: 'string' } } },
    credits: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, amount: { type: 'number', nullable: true }, source: { type: 'string' } } } },
    notes: { type: 'array', items: { type: 'string' } }
  }
};

/* Gemini suggests pages (no tools: a plain answer, free on every model) */
async function askPages(G, key, model, prompt) {
  const r = await G.generate(key, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  });
  const pages = (G.parseJson(r.text) || {}).pages;
  return pages && typeof pages === 'object' ? pages : {};
}

/* Gemini reads the pages; if the reply is not JSON, the same model turns it into JSON.
   → { json, read: [{ uri, title }] of the pages it really fetched } */
async function askRead(G, key, model, prompt) {
  const r = await G.generate(key, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ url_context: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  });
  const read = r.pages.filter(p => /SUCCESS/.test(p.status)).map(p => ({ uri: p.url, title: domainOf(p.url) }));
  try {
    return { json: G.parseJson(r.text), read };
  } catch (e) {
    const s = await G.generate(key, model, {
      contents: [{ role: 'user', parts: [{ text: 'Rewrite this answer as JSON in the requested shape, keeping every figure and URL exactly:\n\n' + r.text }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA }
    });
    return { json: G.parseJson(s.text), read };
  }
}

const bare = u => String(u || '').replace(/[#?].*$/, '').replace(/\/+$/, '');
const samePage = (a, b) => bare(a) === bare(b);

/* ── probe: which features does this key get on each model? ── */

const PROBES = [
  ['plain answer', { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] }],
  ['Google Search', { contents: [{ role: 'user', parts: [{ text: 'Search the web: what does Netflix Standard cost per month in the US today? One short line.' }] }], tools: [{ google_search: {} }] }],
  ['reading a page', { contents: [{ role: 'user', parts: [{ text: 'From https://help.netflix.com/en/node/24926 only: what does Netflix Standard cost per month in the US? One short line.' }] }], tools: [{ url_context: {} }] }]
];

/* "works" only when the feature was really used: search sources came back, or the page was read */
function probeResult(what, r) {
  const text = r.text.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!text) return 'empty answer';
  if (what === 'Google Search' && !r.grounding.length) return 'answered without searching: ' + text;
  if (what === 'reading a page' && !r.pages.some(u => /SUCCESS/.test(u.status))) return 'answered without reading the page: ' + text;
  return 'works' + (r.grounding.length ? ' (' + r.grounding.length + ' sources)' : '') + ': ' + text;
}

async function probe(G, key, models, reportFile) {
  const rows = [];
  let sent = 0;
  for (const model of models) {
    for (const [what, body] of PROBES) {
      if (sent++) await sleep(Number(process.env.GEMINI_PROBE_PACE_MS || 4000));
      let result, missing = false;
      try { result = probeResult(what, await G.generate(key, model, body)); }
      catch (e) {
        missing = G.modelProblem(e) === 'missing';
        result = (missing ? 'model not available: ' : 'refused: ') + oneLine(e);
      }
      console.log(model + ' · ' + what + ' → ' + result);
      rows.push('| ' + model + ' | ' + (missing ? 'any' : what) + ' | ' + result.replace(/\|/g, '\\|') + ' |');
      if (missing) break;
    }
  }
  const report = ['## Gemini probe', '', 'What this key can use on each model. Nothing was changed.', '',
    '| Model | Feature | Result |', '|---|---|---|', ...rows, ''].join('\n');
  fs.writeFileSync(reportFile, report);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=0\nreview=0\nmonth=probe\n');
}

/* ── main ── */

async function main() {
  const o = args(process.argv.slice(2));
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('Set GEMINI_API_KEY (a Google AI Studio key).'); process.exit(2); }
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  let catalogSrc = fs.readFileSync(CATALOG_FILE, 'utf8');
  let cardsSrc = fs.readFileSync(CARDS_FILE, 'utf8');
  const app = loadApp(catalogSrc, cardsSrc);
  const { G } = app;
  if (o.probe) return probe(G, key, app.models, o.report);

  const pagesBefore = readPages();
  const pages = JSON.parse(JSON.stringify(pagesBefore));
  const applied = [], human = [], notes = [], failed = [], noPage = [], used = new Set();
  let checked = 0, unconfirmed = 0, requests = 0, stopped = '';

  const want = id => !o.only.length || o.only.includes(id);
  const services = o.services ? app.catalog.filter(s => s.site && !s.fallbackOnly && want(s.id)) : [];
  const cards = o.cards ? app.cards.filter(c => c.site && want(c.id)) : [];
  /* longest since checked first */
  services.sort((a, b) => staleness(a.asOf, marketsOf(a)).localeCompare(staleness(b.asOf, marketsOf(b))));
  cards.sort((a, b) => staleness(a.asOf).localeCompare(staleness(b.asOf)));

  const refusals = new Map();     /* model → what Google last said when it refused */
  async function request(ask) {
    if (requests >= o.limit) throw new Error('limit');
    if (requests++) await sleep(PACE_MS);
    const r = await G.withModels('ci', async model => {
      try { return await ask(model); }
      catch (e) {
        /* only Google's own word that this model can't take the request now */
        const p = G.modelProblem(e);
        if (p && p !== 'network') { refusals.set(model, oneLine(e)); console.log('  ' + model + ' refused: ' + oneLine(e)); }
        throw e;
      }
    });
    used.add(r.model);
    return r.value;
  }
  /* why a failed request ends the run, or '' when only that item failed */
  function stopReason(e) {
    if (e.message === 'limit') return 'it reached the --limit of ' + o.limit + ' requests';
    const p = G.modelProblem(e);
    return !p ? '' : p === 'network' ? 'Gemini could not be reached' : 'every model refused or was out of allowance (see What Google said)';
  }

  /* the known page for each market, plus ones Gemini suggests on the provider's own site */
  async function pagesFor(company, site, what, markets, known) {
    const out = {};
    markets.forEach(m => { if (known[m]) out[m] = known[m]; });
    const missing = markets.filter(m => !out[m]);
    if (!missing.length) return out;
    const found = await request(model => askPages(G, key, model, pagesPrompt(company, site, what, missing, app.regions)));
    missing.forEach(m => {
      const u = found[m];
      if (typeof u === 'string' && /^https:\/\//.test(u) && isOfficial(u, site)) out[m] = u;
    });
    return out;
  }
  /* a page that was read and showed figures is kept for next time; one that wasn't, or didn't, is dropped */
  const keepPage = (url, read, gaveFigures) => gaveFigures && read.some(p => samePage(p.uri, url));

  for (const svc of services) {
    const markets = marketsOf(svc);
    let res, where;
    try {
      where = await pagesFor(svc.company, svc.site, svc.name + ' plan prices', markets, pages[svc.id] || {});
      markets.filter(m => !where[m]).forEach(m => noPage.push(svc.name + ' (' + m + ')'));
      const prompt = servicePrompt(svc, app.regions, today, where);
      if (!prompt.lines) continue;
      res = await request(model => askRead(G, key, model, prompt.text));
    } catch (e) {
      if ((stopped = stopReason(e))) break;
      failed.push(svc.name + ': ' + e.message); continue;
    }
    checked++;
    const items = [], figures = new Set();
    (res.json.prices || []).forEach(p => {
      const t = svc.tiers.find(x => x.name === p.tier);
      if (!t) return;
      const yearly = !!(t.billedYearly && t.y);
      const current = (yearly ? t.y : t.m)[p.market];
      const region = app.regions[p.market];
      if (current == null || !region || !where[p.market]) return;
      if (p.amount == null) { unconfirmed++; return; }
      figures.add(p.market);
      items.push({ label: svc.name + ' — ' + t.name + ' (' + p.market + ')', tier: t, market: p.market, yearly, current, proposed: p.amount, cur: region.cur, source: p.source });
    });
    const rv = review(items, res.read, svc.site);
    rv.apply.forEach(it => {
      if (it.yearly) {
        catalogSrc = P.setTierPrice(catalogSrc, svc.id, it.tier.name, it.market, it.proposed, 'y');
        if (it.tier.m[it.market] != null) catalogSrc = P.setTierPrice(catalogSrc, svc.id, it.tier.name, it.market, round(it.proposed / 12, it.cur));
      } else {
        catalogSrc = P.setTierPrice(catalogSrc, svc.id, it.tier.name, it.market, it.proposed);
      }
      applied.push(it);
    });
    human.push(...rv.human);
    new Set(rv.apply.concat(rv.confirmed).map(it => it.market)).forEach(m => { catalogSrc = P.setServiceAsOf(catalogSrc, svc.id, m, ym); });
    const kept = {};
    Object.keys(where).forEach(m => { if (keepPage(where[m], res.read, figures.has(m))) kept[m] = where[m]; });
    if (Object.keys(kept).length) pages[svc.id] = kept; else delete pages[svc.id];
    (res.json.notes || []).filter(Boolean).forEach(n => notes.push(svc.name + ': ' + n));
    console.log(svc.id + ': ' + rv.apply.length + ' changed, ' + rv.confirmed.length + ' confirmed, ' + rv.human.length + ' for a human, ' + res.read.length + ' pages read');
  }

  for (const card of (stopped ? [] : cards)) {
    const id = 'card:' + card.id;
    let res, page;
    try {
      page = (await pagesFor(card.issuer, card.site, 'the ' + card.name + ' card’s annual fee, welcome offer and credits', [card.market],
        pages[id] ? { [card.market]: pages[id] } : {}))[card.market];
      if (!page) { noPage.push(card.issuer + ' ' + card.name); continue; }
      res = await request(model => askRead(G, key, model, cardPrompt(card, today, page)));
    } catch (e) {
      if ((stopped = stopReason(e))) break;
      failed.push(card.name + ': ' + e.message); continue;
    }
    checked++;
    const j = res.json, items = [];
    const label = card.issuer + ' ' + card.name;
    if (j.fee && j.fee.amount != null) items.push({ label: label + ' — annual fee', kind: 'fee', current: card.fee, proposed: j.fee.amount, cur: card.cur, source: j.fee.source });
    if (card.bonus && j.bonus) {
      ['amount', 'spend', 'months'].forEach(k => {
        if (j.bonus[k] != null) items.push({ label: label + ' — welcome offer ' + k, kind: 'bonus', key: k, current: card.bonus[k], proposed: j.bonus[k], cur: k === 'spend' ? card.cur : 'COUNT', source: j.bonus.source });
      });
    }
    (j.credits || []).forEach(c => {
      const cr = card.credits.find(x => x.id === c.id);
      if (cr && c.amount != null) items.push({ label: label + ' — ' + cr.name, kind: 'credit', id: cr.id, current: cr.amount, proposed: c.amount, cur: card.cur, source: c.source });
    });
    const rv = review(items, res.read, card.site);
    rv.apply.forEach(it => {
      if (it.kind === 'fee') cardsSrc = P.setCardFee(cardsSrc, card.id, it.proposed);
      else if (it.kind === 'bonus') cardsSrc = P.setCardBonus(cardsSrc, card.id, it.key, it.proposed);
      else cardsSrc = P.setCreditAmount(cardsSrc, card.id, it.id, it.proposed);
      applied.push(it);
    });
    human.push(...rv.human);
    if (rv.apply.length || rv.confirmed.length) cardsSrc = P.setCardAsOf(cardsSrc, card.id, ym);
    if (keepPage(page, res.read, items.length > 0)) pages[id] = page; else delete pages[id];
    (j.notes || []).filter(Boolean).forEach(n => notes.push(label + ': ' + n));
    console.log(card.id + ': ' + rv.apply.length + ' changed, ' + rv.confirmed.length + ' confirmed, ' + rv.human.length + ' for a human, ' + res.read.length + ' pages read');
  }

  /* the patched files must still load before anything is written */
  loadApp(catalogSrc, cardsSrc);
  const pagesChanged = JSON.stringify(pages) !== JSON.stringify(pagesBefore);
  if (!o.dryRun) {
    fs.writeFileSync(CATALOG_FILE, catalogSrc);
    fs.writeFileSync(CARDS_FILE, cardsSrc);
    if (pagesChanged) {
      const sorted = Object.fromEntries(Object.keys(pages).sort().map(k => [k, pages[k]]));
      fs.mkdirSync(path.dirname(PAGES_FILE), { recursive: true });
      fs.writeFileSync(PAGES_FILE, JSON.stringify(sorted, null, 2) + '\n');
    }
  }

  const month = new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const link = it => it.source ? '[' + cell(it.sourceDomain || it.source) + '](' + it.source + ')' + (it.official ? '' : ' (not the provider’s own site)') : '—';
  const shortList = (list, n) => list.slice(0, n).map(cell).join(', ') + (list.length > n ? ' and ' + (list.length - n) + ' more' : '');
  const report = [
    '## Price check — ' + month, '',
    'Checked ' + checked + ' of ' + (services.length + cards.length) + ' services and cards by having Gemini read their own pricing pages' +
      (used.size ? ' (' + [...used].join(', ') + ')' : '') + '. ' +
      applied.length + ' figures changed, ' + human.length + ' need a human look, ' + unconfirmed + ' could not be confirmed and were left as they were.' +
      (stopped ? ' **Stopped early: ' + stopped + '**, so the rest wait for next month or a manual run.' : '') +
      (o.dryRun ? ' This was a dry run: no files were changed.' : ''), '',
    '### Changed', '',
    applied.length ? '| What | Was | Now | Source |\n|---|---|---|---|\n' + applied.map(it => '| ' + cell(it.label) + ' | ' + it.current + ' | ' + it.proposed + ' | ' + link(it) + ' |').join('\n') : 'Nothing.', '',
    '### Needs a human look (not changed)', '',
    human.length ? '| What | Now | Gemini says | Why it was held back | Source |\n|---|---|---|---|---|\n' + human.map(it => '| ' + cell(it.label) + ' | ' + it.current + ' | ' + it.proposed + ' | ' + cell(it.why) + ' | ' + link(it) + ' |').join('\n') : 'Nothing.', '',
    '### Notes from Gemini', '',
    notes.length ? notes.map(n => '- ' + cell(n)).join('\n') : 'None.', ''
  ].concat(noPage.length ? ['### No pricing page to read', '', 'No page on the provider’s own website was known or suggested for: ' + shortList(noPage, 40) + '.', ''] : [])
   .concat(pagesChanged ? ['Pricing pages to read next time are ' + (o.dryRun ? 'not saved in a dry run.' : 'saved in `scripts/data/pricing-pages.json`.'), ''] : [])
   .concat(failed.length ? ['### Failed requests', '', failed.map(f => '- ' + cell(f)).join('\n'), ''] : [])
   .concat(refusals.size ? ['### What Google said', '', 'The last refusal from each model that turned a request down:', '',
     [...refusals].map(([m, msg]) => '- **' + m + '**: ' + cell(msg)).join('\n'), ''] : []).join('\n');
  fs.writeFileSync(o.report, report);
  console.log('\n' + report);
  /* a run that only learned where to read still opens a pull request, so next month starts from those pages */
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + (applied.length + (pagesChanged && !o.dryRun ? 1 : 0)) + '\nreview=' + human.length + '\nmonth=' + ym + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });

export { servicePrompt, cardPrompt, pagesPrompt };
