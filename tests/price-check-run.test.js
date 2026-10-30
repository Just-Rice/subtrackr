const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODELS = (() => { const c = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/data/gemini-models.js'), 'utf8') + ';this.M=GEMINI_MODELS', c); return c.M; })();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* a stand-in for the Gemini API, answering each kind of request the check makes:
   - a plain JSON request for pricing pages (one suggestion is someone else's site);
   - a request with the URL tool, answered from "reading" every page the prompt lists.
   opts.refuse(body) → true makes that request fail as out of allowance. */
function fakeGemini(opts = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const model = /models\/([^:]+):/.exec(req.url)[1];
      const body = JSON.parse(raw);
      const tools = JSON.stringify(body.tools || []);
      const prompt = body.contents[0].parts[0].text;
      seen.push({ model, tools, prompt });
      res.setHeader('content-type', 'application/json');
      const reply = (text, extra) => res.end(JSON.stringify({ candidates: [Object.assign({ content: { parts: [{ text }] } }, extra || {})] }));
      if (opts.refuse && opts.refuse(body)) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: opts.refusal || 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0' } }));
      }
      if (opts.firstModelSpent && model === MODELS[0]) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }));
      }
      if (/give the official web page/.test(prompt)) {
        const pages = /Netflix/.test(prompt)
          ? { US: 'https://help.netflix.com/en/node/24926', GB: 'https://www.netflix.com/gb/', DE: 'https://www.cnet.com/tech/netflix-prices/' }
          : /Gold Card/.test(prompt) ? { US: 'https://www.americanexpress.com/us/credit-cards/card/gold-card/' } : {};
        return reply(JSON.stringify({ pages }));
      }
      if (/url_context/.test(tools)) {
        const urls = [...prompt.matchAll(/https:\/\/[^\s]+/g)].map(m => m[0]).filter(u => !/…/.test(u));
        const metadata = { urlContextMetadata: { urlMetadata: urls.map(u => ({ retrievedUrl: u, urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' })) } };
        if (/reading a page/.test(prompt) || /only: what does Netflix Standard cost/.test(prompt)) return reply('Standard is $19.99', metadata);
        const answer = /Service: Netflix/.test(prompt)
          ? { prices: [
              { tier: 'Premium', market: 'US', amount: 27.99, source: 'https://help.netflix.com/en/node/24926' },
              { tier: 'Standard', market: 'US', amount: 19.99, source: 'https://help.netflix.com/en/node/24926' },
              { tier: 'standard with ADS', market: 'us', amount: 18.99, source: 'https://help.netflix.com/en/node/24926' },
              { tier: 'Ultra', market: 'US', amount: 34.99, source: 'https://help.netflix.com/en/node/24926' },
              { tier: 'Premium', market: 'GB', amount: null, source: '' }],
              notes: ['A new Ultra tier was announced'] }
          : { fee: { amount: 350, source: 'https://www.americanexpress.com/us/credit-cards/card/gold-card/' },
              bonus: { amount: 60000, spend: 6000, months: 6, source: 'https://www.americanexpress.com/us/credit-cards/card/gold-card/' },
              credits: [], notes: [] };
        return reply('```json\n' + JSON.stringify(answer) + '\n```', metadata);
      }
      reply('OK');
    });
  });
  return { server, seen };
}

function runCheck(server, args, env = {}) {
  return new Promise((resolve, reject) => execFile(process.execPath, [path.join(ROOT, 'scripts/check-prices.mjs')].concat(args),
    { env: Object.assign({}, process.env, { GEMINI_API_KEY: 'test', GEMINI_PACE_MS: '0', GEMINI_PROBE_PACE_MS: '0', GEMINI_API_BASE: 'http://127.0.0.1:' + server.address().port, GITHUB_OUTPUT: '' }, env) },
    (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));
}

async function withServer(fake, fn) {
  await new Promise(r => fake.server.listen(0, '127.0.0.1', r));
  const report = path.join(os.tmpdir(), 'subtrackr-report-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.md');
  try { await fn(report); } finally { fake.server.close(); fs.rmSync(report, { force: true }); }
}

test('the monthly check finds each provider’s own pages, reads them, applies sourced changes and reports the rest', async () => {
  const fake = fakeGemini({ firstModelSpent: true });
  const catalogBefore = fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8');
  const cardsBefore = fs.readFileSync(path.join(ROOT, 'js/data/cards.js'), 'utf8');
  const pagesBefore = fs.readFileSync(path.join(ROOT, 'scripts/data/pricing-pages.json'), 'utf8');
  await withServer(fake, async report => {
    const out = await runCheck(fake.server, ['--only', 'netflix,amex-gold', '--dry-run', '--report', report]);
    const md = fs.readFileSync(report, 'utf8');
    assert.equal(fake.seen[0].model, MODELS[0]);
    assert.ok(fake.seen.slice(1).every(r => r.model === MODELS[1]), 'moved to the next model and stayed there');
    assert.ok(fake.seen.every(r => !/google_search/.test(r.tools)), 'never asks for Google Search, which needs billing');
    const read = fake.seen.find(r => /url_context/.test(r.tools) && /Service: Netflix/.test(r.prompt));
    assert.ok(read && !/cnet\.com/.test(read.prompt), 'a page on someone else’s site is never read');
    assert.match(md, /Netflix — Premium \(US\) \| 26\.99 \| 27\.99/);
    assert.match(md, /annual fee \| 325 \| 350/);
    assert.match(md, /Standard with ads \(US\) \| 8\.99 \| 18\.99 \| moved more than 40%/);
    assert.match(md, /A new Ultra tier was announced/);
    assert.match(md, /Netflix: answered for plans not in the catalogue — Ultra/);
    assert.match(md, /3 could not be confirmed/, 'every plan asked about without a figure counts');
    assert.match(md, /### No pricing page to read[\s\S]*Netflix \(DE\)/);
    assert.match(md, /not saved in a dry run/);
    assert.match(md, /dry run/);
    assert.match(out, /netflix: 1 changed, 1 confirmed, 1 for a human, 2 pages read/);
    assert.equal(fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8'), catalogBefore, 'a dry run changes nothing');
    assert.equal(fs.readFileSync(path.join(ROOT, 'js/data/cards.js'), 'utf8'), cardsBefore);
    assert.equal(fs.readFileSync(path.join(ROOT, 'scripts/data/pricing-pages.json'), 'utf8'), pagesBefore);
  });
});

test('pages that were read and showed prices are remembered, and the next run reads them without asking again', async () => {
  const pagesFile = path.join(os.tmpdir(), 'subtrackr-pages-' + process.pid + '.json');
  fs.writeFileSync(pagesFile, '{}\n');
  const env = { PRICING_PAGES_FILE: pagesFile };
  const catalog = path.join(ROOT, 'js/data/catalog.js'), cards = path.join(ROOT, 'js/data/cards.js');
  const catalogBefore = fs.readFileSync(catalog, 'utf8'), cardsBefore = fs.readFileSync(cards, 'utf8');
  try {
    let fake = fakeGemini();
    await withServer(fake, report => runCheck(fake.server, ['--only', 'netflix,amex-gold', '--report', report], env));
    const saved = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
    assert.deepEqual(saved, {
      'card:amex-gold': 'https://www.americanexpress.com/us/credit-cards/card/gold-card/',
      netflix: { US: 'https://help.netflix.com/en/node/24926' }
    }, 'GB was read but showed no figures, DE was not the provider’s site');
    fs.writeFileSync(catalog, catalogBefore); fs.writeFileSync(cards, cardsBefore);
    fake = fakeGemini();
    await withServer(fake, report => runCheck(fake.server, ['--only', 'amex-gold', '--dry-run', '--report', report], env));
    assert.ok(!fake.seen.some(r => /give the official web page/.test(r.prompt)), 'a known page is read without asking for one');
  } finally {
    fs.writeFileSync(catalog, catalogBefore); fs.writeFileSync(cards, cardsBefore);
    fs.rmSync(pagesFile, { force: true });
  }
});

test('when every model refuses, the report says so and quotes what Google said', async () => {
  const fake = fakeGemini({ refuse: () => true });
  await withServer(fake, async report => {
    await runCheck(fake.server, ['--only', 'netflix', '--dry-run', '--report', report]);
    const md = fs.readFileSync(report, 'utf8');
    assert.match(md, /\*\*Stopped early: every model refused or was out of allowance/);
    assert.match(md, /### What Google said/);
    MODELS.forEach(m => assert.match(md, new RegExp('\\*\\*' + esc(m) + '\\*\\*: \\[429\\] RESOURCE_EXHAUSTED Quota exceeded for metric: generate_content_free_tier_requests, limit: 0')));
  });
});

test('a probe reports which features each model allows, and changes nothing', async () => {
  const fake = fakeGemini({ refuse: body => /google_search/.test(JSON.stringify(body.tools || [])), refusal: 'You exceeded your current quota, please check your plan and billing details.' });
  const catalogBefore = fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8');
  await withServer(fake, async report => {
    await runCheck(fake.server, ['--probe', '--report', report]);
    const md = fs.readFileSync(report, 'utf8');
    assert.match(md, new RegExp('\\| ' + esc(MODELS[0]) + ' \\| plain answer \\| works: OK \\|'));
    assert.match(md, new RegExp('\\| ' + esc(MODELS[0]) + ' \\| Google Search \\| refused: \\[429\\]'));
    assert.match(md, new RegExp('\\| ' + esc(MODELS.at(-1)) + ' \\| reading a page \\| works: Standard is \\$19\\.99 \\|'));
    assert.equal(fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8'), catalogBefore);
  });
});
