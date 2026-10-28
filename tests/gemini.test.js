const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const DAILY = new Error('[429] You exceeded your current quota: GenerateRequestsPerDayPerProjectPerModel-FreeTier');
const MINUTE = new Error('[429] RESOURCE_EXHAUSTED: GenerateRequestsPerMinutePerProjectPerModel-FreeTier');

function setup() {
  const ctx = load();
  return { G: ctx.ST.gemini, MODELS: ctx.get('GEMINI_MODELS') };
}

test('only 3.1-generation models and newer, best first', () => {
  const { MODELS } = setup();
  assert.equal(MODELS[0], 'gemini-3.8-flash');
  MODELS.forEach(m => {
    const v = /gemini-(\d+)\.(\d+)/.exec(m);
    assert.ok(v && (Number(v[1]) > 3 || (Number(v[1]) === 3 && Number(v[2]) >= 1)), m + ' is 3.1 or newer');
  });
});

test('a failure is read as used up for the day, busy for the minute, missing, or real', () => {
  const { G } = setup();
  assert.equal(G.modelProblem(DAILY), 'day');
  assert.equal(G.modelProblem(MINUTE), 'minute');
  assert.equal(G.modelProblem(new Error('[404] models/gemini-x is not found for API version v1beta')), 'missing');
  assert.equal(G.modelProblem(new Error('[503] UNAVAILABLE: high demand')), 'minute');
  assert.equal(G.modelProblem(new Error('[401] Firebase App Check token is invalid')), null);
  assert.equal(G.modelProblem(new Error('AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/gemini-x:generateContent: Failed to fetch (AI/error)')), 'network');
  assert.equal(G.modelProblem(new TypeError('fetch failed')), 'network');
});

test('a model that gets no reply is passed over once, not remembered as spent', async () => {
  const { G, MODELS } = setup();
  const NOREPLY = new Error('AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/' + MODELS[0] + ':generateContent: Failed to fetch (AI/error)');
  const tried = [];
  const r = await G.withModels('site', async name => { tried.push(name); if (name === MODELS[0]) throw NOREPLY; return 'from ' + name; });
  assert.equal(r.model, MODELS[1]);
  tried.length = 0;
  await G.withModels('site', async name => { tried.push(name); return 'ok'; });
  assert.deepEqual(tried, [MODELS[0]], 'the best model is asked first again next time');
  /* offline: every model fails the same way, the error comes out, and nothing is marked spent */
  await assert.rejects(G.withModels('site', async () => { throw new TypeError('fetch failed'); }), /fetch failed/);
  tried.length = 0;
  await G.withModels('site', async name => { tried.push(name); return 'ok'; });
  assert.deepEqual(tried, [MODELS[0]]);
});

test('when a model runs out for the day the next answers, and the spent one is skipped all day', async () => {
  const { G, MODELS } = setup();
  const tried = [];
  const r = await G.withModels('own', async name => { tried.push(name); if (name === MODELS[0]) throw DAILY; return 'from ' + name; });
  assert.equal(r.value, 'from ' + MODELS[1]);
  assert.equal(r.model, MODELS[1]);
  tried.length = 0;
  await G.withModels('own', async name => { tried.push(name); return 'ok'; });
  assert.deepEqual(tried, [MODELS[1]]);
  tried.length = 0;
  await G.withModels('site', async name => { tried.push(name); return 'ok'; });
  assert.deepEqual(tried, [MODELS[0]], 'another scope has its own allowance');
});

test('a model busy for the minute comes back a minute later', async () => {
  const { G, MODELS } = setup();
  const t0 = Date.UTC(2026, 9, 28, 18);
  await G.withModels('own', async name => { if (name === MODELS[0]) throw MINUTE; return 'ok'; }, { now: () => t0 });
  const a = [];
  await G.withModels('own', async name => { a.push(name); return 'ok'; }, { now: () => t0 + 30000 });
  assert.equal(a[0], MODELS[1]);
  const b = [];
  await G.withModels('own', async name => { b.push(name); return 'ok'; }, { now: () => t0 + 61000 });
  assert.equal(b[0], MODELS[0]);
});

test('a real failure stops at once; all used up reports the last error', async () => {
  const { G } = setup();
  const tried = [];
  await assert.rejects(G.withModels('own', async name => { tried.push(name); throw new Error('[400] API key not valid'); }), /API key/);
  assert.equal(tried.length, 1);
  await assert.rejects(G.withModels('site', async () => { throw DAILY; }), /quota/);
  await assert.rejects(G.withModels('site', async () => 'ok'), /used up/);
});

test('JSON is read from a fenced or chatty reply', () => {
  const { G } = setup();
  assert.deepEqual(JSON.parse(JSON.stringify(G.parseJson('Here you go:\n```json\n{"a":1}\n```'))), { a: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(G.parseJson('Sure! {"b":[2]} hope that helps'))), { b: [2] });
});
