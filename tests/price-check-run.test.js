const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');

/* a stand-in for the Gemini API: the newest model is out of allowance for the
   day, the next answers with grounded prices */
function fakeGemini() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const model = /models\/([^:]+):/.exec(req.url)[1];
      seen.push(model);
      const prompt = JSON.parse(body).contents[0].parts[0].text;
      res.setHeader('content-type', 'application/json');
      if (model === 'gemini-3.8-flash') {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }));
      }
      const answer = /Service: Netflix/.test(prompt)
        ? { prices: [
            { tier: 'Premium', market: 'US', amount: 27.99, source: 'https://help.netflix.com/en/node/24926' },
            { tier: 'Standard', market: 'US', amount: 19.99, source: 'https://www.netflix.com/signup' },
            { tier: 'Standard with ads', market: 'US', amount: 18.99, source: 'https://www.netflix.com/signup' },
            { tier: 'Premium', market: 'GB', amount: null, source: '' }],
            notes: ['A new Ultra tier was announced'] }
        : { fee: { amount: 350, source: 'https://www.americanexpress.com/us/credit-cards/card/gold-card/' },
            bonus: { amount: 60000, spend: 6000, months: 6, source: 'https://www.americanexpress.com/us/credit-cards/card/gold-card/' },
            credits: [], notes: [] };
      res.end(JSON.stringify({ candidates: [{
        content: { parts: [{ text: '```json\n' + JSON.stringify(answer) + '\n```' }] },
        groundingMetadata: { groundingChunks: [
          { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x', title: 'netflix.com' } },
          { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/y', title: 'americanexpress.com' } }] }
      }] }));
    });
  });
  return { server, seen };
}

test('the monthly check falls back across models, applies grounded changes and reports the rest', async () => {
  const { server, seen } = fakeGemini();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const report = path.join(os.tmpdir(), 'subtrackr-price-report-' + process.pid + '.md');
  const catalogBefore = fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8');
  const cardsBefore = fs.readFileSync(path.join(ROOT, 'js/data/cards.js'), 'utf8');
  try {
    const out = await new Promise((resolve, reject) => execFile(process.execPath,
      [path.join(ROOT, 'scripts/check-prices.mjs'), '--only', 'netflix,amex-gold', '--dry-run', '--report', report],
      { env: Object.assign({}, process.env, { GEMINI_API_KEY: 'test', GEMINI_PACE_MS: '0', GEMINI_API_BASE: 'http://127.0.0.1:' + server.address().port, GITHUB_OUTPUT: '' }) },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));
    const md = fs.readFileSync(report, 'utf8');
    assert.equal(seen[0], 'gemini-3.8-flash');
    assert.ok(seen.slice(1).every(m => m === 'gemini-3.7-flash'), 'moved to the next model and stayed there');
    assert.match(md, /Netflix — Premium \(US\) \| 26\.99 \| 27\.99/);
    assert.match(md, /annual fee \| 325 \| 350/);
    assert.match(md, /Standard with ads \(US\) \| 8\.99 \| 18\.99 \| moved more than 40%/);
    assert.match(md, /A new Ultra tier was announced/);
    assert.match(md, /dry run/);
    assert.match(out, /netflix: 1 changed, 1 confirmed, 1 for a human/);
    assert.equal(fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8'), catalogBefore, 'a dry run changes nothing');
    assert.equal(fs.readFileSync(path.join(ROOT, 'js/data/cards.js'), 'utf8'), cardsBefore);
  } finally {
    server.close();
    fs.rmSync(report, { force: true });
  }
});

const MODELS = (() => { const c = {}; require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js/data/gemini-models.js'), 'utf8') + ';this.M=GEMINI_MODELS', c); return c.M; })();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* a stand-in for a free key that may not use Google Search: every request with
   the search tool is refused, everything else answers (and reads the page) */
function noSearchGemini() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const tools = JSON.stringify(JSON.parse(body).tools || []);
      res.setHeader('content-type', 'application/json');
      if (/google_search/.test(tools)) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: search_grounding_request, limit: 0' } }));
      }
      const read = /url_context/.test(tools);
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: read ? 'Standard is $19.99' : 'OK' }] },
        urlContextMetadata: read ? { urlMetadata: [{ retrievedUrl: 'https://help.netflix.com/en/node/24926', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }] } : undefined }] }));
    });
  });
  return server;
}

function runCheck(server, args) {
  return new Promise((resolve, reject) => execFile(process.execPath, [path.join(ROOT, 'scripts/check-prices.mjs')].concat(args),
    { env: Object.assign({}, process.env, { GEMINI_API_KEY: 'test', GEMINI_PACE_MS: '0', GEMINI_PROBE_PACE_MS: '0', GEMINI_API_BASE: 'http://127.0.0.1:' + server.address().port, GITHUB_OUTPUT: '' }) },
    (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));
}

test('when every model refuses, the report says so and quotes what Google said', async () => {
  const server = noSearchGemini();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const report = path.join(os.tmpdir(), 'subtrackr-refused-' + process.pid + '.md');
  try {
    await runCheck(server, ['--only', 'netflix', '--dry-run', '--report', report]);
    const md = fs.readFileSync(report, 'utf8');
    assert.match(md, /\*\*Stopped early: every model refused or was out of allowance/);
    assert.match(md, /### What Google said/);
    MODELS.forEach(m => assert.match(md, new RegExp('\\*\\*' + esc(m) + '\\*\\*: \\[429\\] RESOURCE_EXHAUSTED Quota exceeded for metric: search_grounding_request, limit: 0')));
  } finally {
    server.close();
    fs.rmSync(report, { force: true });
  }
});

test('a probe reports which features each model allows, and changes nothing', async () => {
  const server = noSearchGemini();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const report = path.join(os.tmpdir(), 'subtrackr-probe-' + process.pid + '.md');
  const catalogBefore = fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8');
  try {
    await runCheck(server, ['--probe', '--report', report]);
    const md = fs.readFileSync(report, 'utf8');
    assert.match(md, new RegExp('\\| ' + esc(MODELS[0]) + ' \\| plain answer \\| works: OK \\|'));
    assert.match(md, new RegExp('\\| ' + esc(MODELS[0]) + ' \\| Google Search \\| refused: \\[429\\]'));
    assert.match(md, new RegExp('\\| ' + esc(MODELS.at(-1)) + ' \\| reading a page \\| works: Standard is \\$19\\.99 \\|'));
    assert.equal(fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8'), catalogBefore);
  } finally {
    server.close();
    fs.rmSync(report, { force: true });
  }
});
