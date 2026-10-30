#!/usr/bin/env node
/* check-prices.mjs — the monthly price check. Asks Gemini, with Google Search,
 * for the current list price of every catalogue plan and the current terms of
 * every built-in card, keeps the answers that pass the guardrails in
 * scripts/lib/price-review.mjs, writes them into js/data/catalog.js and
 * js/data/cards.js, and writes a Markdown report for the pull request.
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
import { review } from './lib/price-review.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_FILE = path.join(ROOT, 'js/data/catalog.js');
const CARDS_FILE = path.join(ROOT, 'js/data/cards.js');
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
    console, Intl, Date, URL,
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

/* ── prompts ── */

const RULES = [
  'Reply with JSON only, no prose and no Markdown.',
  'Only the items listed: never add plans, markets, cards or credits.',
  'amount is the number alone, in the currency given — never convert currencies.',
  'Use null for anything you cannot confirm from a page you found in this search; do not guess or carry the current figure over.',
  'source is the URL of the page that shows the figure, preferably the provider\'s own pricing page.',
  'Put new or discontinued plans, credits or offers, and anything else worth a human look, in notes.'
].join(' ');

function servicePrompt(svc, regions, today) {
  const lines = [];
  svc.tiers.forEach(t => {
    const yearly = t.billedYearly && t.y;
    const prices = yearly ? t.y : t.m;
    Object.keys(prices || {}).forEach(code => {
      const cur = (regions[code] || {}).cur;
      if (!cur) return;
      lines.push('- tier "' + t.name + '", market ' + code + ' (' + regions[code].name + '), ' + cur + ' per ' +
        (yearly ? 'year' : t.cycle === 'fourweekly' ? '28 days' : t.cycle === 'yearly' ? 'year' : 'month') + ': currently ' + prices[code]);
    });
  });
  return {
    lines: lines.length,
    text: 'Today is ' + today + '. You are checking list prices for a subscription-price tracker.\n' +
      'Use Google Search to find the CURRENT advertised price that a new customer pays for each plan below, in each market, ' +
      'in that market\'s local currency, including tax where the provider shows prices that way.\n\n' +
      'Service: ' + svc.name + ' (' + svc.company + ', ' + svc.site + ')\n' + lines.join('\n') + '\n\n' +
      'Answer as {"prices":[{"tier":"…","market":"US","amount":12.99,"source":"https://…"}],"notes":["…"]}. ' + RULES
  };
}

function cardPrompt(card, today) {
  const credits = card.credits.map(c => '- credit "' + c.id + '" (' + c.name + '): currently ' + c.amount + ' ' + card.cur + ' per ' + c.cadence).join('\n');
  return 'Today is ' + today + '. You are checking credit card terms for a card-value tracker.\n' +
    'Use Google Search to find the CURRENT published terms of this card for new applicants in ' + card.market + ':\n\n' +
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

/* grounded search; if the reply is not JSON, the same model turns it into JSON */
async function ask(G, key, model, prompt) {
  const r = await G.generate(key, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  });
  try {
    return { json: G.parseJson(r.text), grounding: r.grounding };
  } catch (e) {
    const s = await G.generate(key, model, {
      contents: [{ role: 'user', parts: [{ text: 'Rewrite this answer as JSON in the requested shape, keeping every figure and URL exactly:\n\n' + r.text }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA }
    });
    return { json: G.parseJson(s.text), grounding: r.grounding };
  }
}

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

  const applied = [], human = [], notes = [], failed = [], used = new Set();
  let checked = 0, unconfirmed = 0, requests = 0, stopped = '';

  const want = id => !o.only.length || o.only.includes(id);
  const services = o.services ? app.catalog.filter(s => s.site && !s.fallbackOnly && want(s.id)) : [];
  const cards = o.cards ? app.cards.filter(c => c.site && want(c.id)) : [];

  const refusals = new Map();     /* model → what Google last said when it refused */
  async function request(prompt) {
    if (requests >= o.limit) throw new Error('limit');
    if (requests++) await sleep(PACE_MS);
    const r = await G.withModels('ci', async model => {
      try { return await ask(G, key, model, prompt); }
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

  for (const svc of services) {
    const prompt = servicePrompt(svc, app.regions, today);
    if (!prompt.lines) continue;
    let res;
    try { res = await request(prompt.text); }
    catch (e) {
      if ((stopped = stopReason(e))) break;
      failed.push(svc.name + ': ' + e.message); continue;
    }
    checked++;
    const items = [];
    (res.json.prices || []).forEach(p => {
      const t = svc.tiers.find(x => x.name === p.tier);
      if (!t) return;
      const yearly = !!(t.billedYearly && t.y);
      const current = (yearly ? t.y : t.m)[p.market];
      const region = app.regions[p.market];
      if (current == null || !region) return;
      if (p.amount == null) { unconfirmed++; return; }
      items.push({ label: svc.name + ' — ' + t.name + ' (' + p.market + ')', tier: t, market: p.market, yearly, current, proposed: p.amount, cur: region.cur, source: p.source });
    });
    const rv = review(items, res.grounding, svc.site);
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
    (res.json.notes || []).filter(Boolean).forEach(n => notes.push(svc.name + ': ' + n));
    console.log(svc.id + ': ' + rv.apply.length + ' changed, ' + rv.confirmed.length + ' confirmed, ' + rv.human.length + ' for a human');
  }

  for (const card of (stopped ? [] : cards)) {
    let res;
    try { res = await request(cardPrompt(card, today)); }
    catch (e) {
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
    const rv = review(items, res.grounding, card.site);
    rv.apply.forEach(it => {
      if (it.kind === 'fee') cardsSrc = P.setCardFee(cardsSrc, card.id, it.proposed);
      else if (it.kind === 'bonus') cardsSrc = P.setCardBonus(cardsSrc, card.id, it.key, it.proposed);
      else cardsSrc = P.setCreditAmount(cardsSrc, card.id, it.id, it.proposed);
      applied.push(it);
    });
    human.push(...rv.human);
    if (rv.apply.length || rv.confirmed.length) cardsSrc = P.setCardAsOf(cardsSrc, card.id, ym);
    (j.notes || []).filter(Boolean).forEach(n => notes.push(label + ': ' + n));
    console.log(card.id + ': ' + rv.apply.length + ' changed, ' + rv.confirmed.length + ' confirmed, ' + rv.human.length + ' for a human');
  }

  /* the patched files must still load before anything is written */
  loadApp(catalogSrc, cardsSrc);
  if (!o.dryRun) {
    fs.writeFileSync(CATALOG_FILE, catalogSrc);
    fs.writeFileSync(CARDS_FILE, cardsSrc);
  }

  const month = new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const link = it => it.source ? '[' + cell(it.sourceDomain || it.source) + '](' + it.source + ')' + (it.official ? '' : ' (secondary source)') : '—';
  const report = [
    '## Price check — ' + month, '',
    'Checked ' + checked + ' of ' + (services.length + cards.length) + ' services and cards with Gemini and Google Search' +
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
  ].concat(failed.length ? ['### Failed requests', '', failed.map(f => '- ' + cell(f)).join('\n'), ''] : [])
   .concat(refusals.size ? ['### What Google said', '', 'The last refusal from each model that turned a request down:', '',
     [...refusals].map(([m, msg]) => '- **' + m + '**: ' + cell(msg)).join('\n'), ''] : []).join('\n');
  fs.writeFileSync(o.report, report);
  console.log('\n' + report);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + applied.length + '\nreview=' + human.length + '\nmonth=' + ym + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });

export { servicePrompt, cardPrompt };
