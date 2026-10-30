const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* the patched text still runs and yields the catalogue */
function evalData(files) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  files.forEach(([name, text]) => vm.runInContext(text, ctx, { filename: name }));
  return { catalog: vm.runInContext('CATALOG', ctx), cards: vm.runInContext('CARDS', ctx) };
}
const tier = (cat, id, name) => cat.find(s => s.id === id).tiers.find(t => t.name === name);

test('a tier price changes in one market and nothing else moves', async () => {
  const P = await import('../scripts/lib/patch-catalog.mjs');
  const src = read('js/data/catalog.js');
  const out = P.setTierPrice(src, 'netflix', 'Premium', 'US', 27.99);
  const before = evalData([['regions.js', read('js/data/regions.js')], ['catalog.js', src], ['cards.js', read('js/data/cards.js')]]).catalog;
  const after = evalData([['regions.js', read('js/data/regions.js')], ['catalog.js', out], ['cards.js', read('js/data/cards.js')]]).catalog;
  assert.equal(tier(after, 'netflix', 'Premium').m.US, 27.99);
  assert.equal(tier(after, 'netflix', 'Premium').m.GB, tier(before, 'netflix', 'Premium').m.GB);
  assert.equal(tier(after, 'netflix', 'Standard').m.US, tier(before, 'netflix', 'Standard').m.US);
  const diff = out.split('\n').filter((l, i) => l !== src.split('\n')[i]);
  assert.equal(diff.length, 1, 'one line changed');
  assert.throws(() => P.setTierPrice(src, 'netflix', 'Premium', 'ZZ', 1), /not carried/);
  assert.throws(() => P.setTierPrice(src, 'netflix', 'Nope', 'US', 1), /tier Nope/);
});

test('yearly prices and checked dates are patched, asOf added where missing', async () => {
  const P = await import('../scripts/lib/patch-catalog.mjs');
  let src = read('js/data/catalog.js');
  src = P.setTierPrice(src, 'criterion', 'Annual', 'US', 109.99, 'y');
  src = P.setServiceAsOf(src, 'netflix', 'GB', '2026-11');
  src = P.setServiceAsOf(src, 'netflix', 'DE', '2026-11');
  src = P.setServiceAsOf(src, 'criterion', 'US', '2026-11');
  const cat = evalData([['regions.js', read('js/data/regions.js')], ['catalog.js', src], ['cards.js', read('js/data/cards.js')]]).catalog;
  assert.equal(tier(cat, 'criterion', 'Annual').y.US, 109.99);
  const nf = cat.find(s => s.id === 'netflix');
  assert.equal(nf.asOf.GB, '2026-11');
  assert.equal(nf.asOf.DE, '2026-11');
  assert.equal(nf.asOf.US, '2026-10', 'others kept');
  assert.equal(cat.find(s => s.id === 'criterion').asOf.US, '2026-11');
});

test('card fees, bonuses and credits are patched in place', async () => {
  const P = await import('../scripts/lib/patch-catalog.mjs');
  let src = read('js/data/cards.js');
  src = P.setCardFee(src, 'amex-gold', 350);
  src = P.setCardBonus(src, 'amex-platinum', 'amount', 150000);
  src = P.setCreditAmount(src, 'amex-platinum', 'uber', 20);
  src = P.setCardAsOf(src, 'amex-platinum', '2026-11');
  const cards = evalData([['regions.js', read('js/data/regions.js')], ['catalog.js', read('js/data/catalog.js')], ['cards.js', src]]).cards;
  const plat = cards.find(c => c.id === 'amex-platinum');
  assert.equal(cards.find(c => c.id === 'amex-gold').fee, 350);
  assert.equal(plat.fee, 895);
  assert.equal(plat.bonus.amount, 150000);
  assert.equal(plat.bonus.spend, 8000);
  assert.equal(plat.credits.find(c => c.id === 'uber').amount, 20);
  assert.equal(plat.credits.find(c => c.id === 'uber-dec').amount, 20, 'a similarly named credit is untouched');
  assert.equal(plat.asOf, '2026-11');
  assert.throws(() => P.setCreditAmount(src, 'amex-platinum', 'nope', 1), /credit nope/);
});

test('guardrails: only grounded, sane, modest changes apply', async () => {
  const R = await import('../scripts/lib/price-review.mjs');
  const grounding = [{ uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'netflix.com' },
                     { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/def', title: 'theverge.com' }];
  const r = R.review([
    { label: 'Premium US', current: 26.99, proposed: 27.99, cur: 'USD', source: 'https://help.netflix.com/en/node/24926' },
    { label: 'Standard US', current: 19.99, proposed: 19.99, cur: 'USD', source: 'https://www.netflix.com/signup' },
    { label: 'Basic US', current: 9.99, proposed: 11.99, cur: 'USD', source: 'https://madeup.example/prices' },
    { label: 'Ads US', current: 8.99, proposed: 18.99, cur: 'USD', source: 'https://www.theverge.com/netflix' },
    { label: 'Mobile IN', current: 149, proposed: 159.5, cur: 'INR', source: 'https://netflix.com/in' },
    { label: 'Unknown', current: 5, proposed: null, cur: 'USD', source: '' }
  ], grounding, 'netflix.com');
  assert.deepEqual(r.apply.map(x => x.label), ['Premium US']);
  assert.equal(r.apply[0].official, true);
  assert.deepEqual(r.confirmed.map(x => x.label), ['Standard US']);
  assert.deepEqual(r.human.map(x => x.label + ': ' + x.why), [
    'Basic US: source madeup.example was not among the pages read',
    'Ads US: moved more than 40%',
    'Mobile IN: INR prices are whole numbers'
  ]);
});

test('a page counts as the provider’s own on its domain, a subdomain or a country domain of the same name', async () => {
  const R = await import('../scripts/lib/price-review.mjs');
  assert.equal(R.isOfficial('https://help.netflix.com/en/node/24926', 'netflix.com'), true);
  assert.equal(R.isOfficial('https://www.amazon.co.uk/amazonprime', 'amazon.com'), true);
  assert.equal(R.isOfficial('https://www.americanexpress.com/en-gb/credit-cards/gold/', 'americanexpress.com/uk'), true);
  assert.equal(R.isOfficial('https://www.cnet.com/tech/netflix-prices/', 'netflix.com'), false);
  assert.equal(R.isOfficial('https://netflix.example.com/prices', 'netflix.com'), false);
  assert.equal(R.isOfficial('not a url', 'netflix.com'), false);
  assert.equal(R.brandOf('www.disneyplus.com'), 'disneyplus');
  assert.equal(R.brandOf('apple.co.jp'), 'apple');
});
