/* The catalogue and cards as shipped (js/data), which the monthly price check
   rewrites. The other tests run on frozen copies (tests/fixtures), so these are
   the checks a changed figure has to pass: every price is a real number, every
   card adds up, and the price check can still find every figure it looks after.
   Nothing here expects a particular price. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./load');

const ROOT = path.join(__dirname, '..');
const TODAY = '2026-10-27';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const CADENCES = ['monthly', 'quarterly', 'semiannual', 'yearly', 'cardyear', 'once'];
const amount = v => typeof v === 'number' && isFinite(v) && v > 0;
const price = v => typeof v === 'number' && isFinite(v) && v >= 0;   /* a free plan is 0 */

function live() {
  const ctx = load({ today: TODAY, live: true });
  return { ctx, catalog: ctx.get('CATALOG'), cards: ctx.get('CARDS'), regions: ctx.get('REGION_BY_CODE') };
}

test('every catalogue price is a real number in a market the app knows', () => {
  const { catalog, regions } = live();
  assert.ok(catalog.length >= 100, 'the catalogue loaded');
  const ids = new Set();
  catalog.forEach(svc => {
    assert.ok(!ids.has(svc.id), svc.id + ' is listed once');
    ids.add(svc.id);
    assert.ok(Array.isArray(svc.tiers) && svc.tiers.length, svc.id + ' has plans');
    const names = new Set();
    svc.tiers.forEach(t => {
      const what = svc.id + ' / ' + t.name;
      assert.ok(!names.has(t.name), what + ' is listed once');
      names.add(t.name);
      ['m', 'y'].forEach(field => Object.entries(t[field] || {}).forEach(([market, p]) => {
        assert.ok(regions[market], what + ': ' + market + ' is a market the app knows');
        assert.ok(price(p), what + ' ' + market + ' ' + field + ' price is a number of zero or more, not ' + p);
      }));
    });
    Object.entries(svc.asOf || {}).forEach(([market, ym]) => {
      assert.ok(regions[market], svc.id + ' asOf: ' + market + ' is a market the app knows');
      assert.match(String(ym), MONTH, svc.id + ' asOf ' + market);
    });
  });
});

test('every card has sane terms and a value that adds up', () => {
  const { ctx, cards } = live();
  const S = ctx.ST.store, V = ctx.ST.cardvalue;
  assert.ok(cards.length >= 10, 'the cards loaded');
  const ids = new Set();
  cards.forEach(card => {
    assert.ok(!ids.has(card.id), card.id + ' is listed once');
    ids.add(card.id);
    assert.ok(typeof card.fee === 'number' && isFinite(card.fee) && card.fee >= 0, card.id + ' fee');
    assert.match(String(card.asOf), MONTH, card.id + ' asOf');
    const credits = new Set();
    card.credits.forEach(c => {
      assert.ok(!credits.has(c.id), card.id + ' credit ' + c.id + ' is listed once');
      credits.add(c.id);
      assert.ok(amount(c.amount), card.id + ' credit ' + c.id + ' is a positive number, not ' + c.amount);
      assert.ok(CADENCES.includes(c.cadence), card.id + ' credit ' + c.id + ' cadence ' + c.cadence);
    });
    if (card.bonus) ['amount', 'spend', 'months'].forEach(k => {
      /* an offer paid on approval has no spend to meet, so 0 is a fair figure here */
      if (card.bonus[k] != null) assert.ok(price(card.bonus[k]), card.id + ' welcome offer ' + k + ' is a number, not ' + card.bonus[k]);
    });
    card.earn.forEach(e => assert.ok(amount(e.x), card.id + ' earn rate for ' + e.cat));

    /* someone holding the card, with nothing logged: the sums come out as numbers */
    const st = S.migrate({ version: 2, settings: { region: card.market }, cards: [{ id: 'mine', cardId: card.id, fee: card.fee, feeDate: '2027-01-15' }] });
    const v = V.value(st, st.cards[0], TODAY);
    ['creditsUsed', 'creditsPotential', 'getting', 'could'].forEach(k =>
      assert.ok(typeof v[k] === 'number' && isFinite(v[k]), card.id + ' ' + k + ' is a number, not ' + v[k]));
    /* nothing logged, so only credits that arrive by themselves count as used */
    assert.ok(v.creditsUsed >= 0 && v.creditsUsed <= v.creditsPotential, card.id + ' credits used (' + v.creditsUsed + ') within what the card offers (' + v.creditsPotential + ')');
  });
});

test('the price check can still find every figure it looks after', async () => {
  const P = await import('../scripts/lib/patch-catalog.mjs');
  const { catalog, cards } = live();
  const catalogSrc = fs.readFileSync(path.join(ROOT, 'js/data/catalog.js'), 'utf8');
  const cardsSrc = fs.readFileSync(path.join(ROOT, 'js/data/cards.js'), 'utf8');
  /* writing a figure back as it is must be possible for each one; the patcher throws when it can't find it */
  catalog.forEach(svc => {
    svc.tiers.forEach(t => ['m', 'y'].forEach(field => Object.entries(t[field] || {}).forEach(([market, price]) => {
      assert.doesNotThrow(() => P.setTierPrice(catalogSrc, svc.id, t.name, market, price, field), svc.id + ' / ' + t.name + ' ' + market + ' ' + field);
    })));
    const market = Object.keys(svc.asOf || {})[0] || Object.keys(svc.tiers[0].m)[0];
    if (market) assert.doesNotThrow(() => P.setServiceAsOf(catalogSrc, svc.id, market, '2026-10'), svc.id + ' asOf');
  });
  cards.forEach(card => {
    if (card.fee > 0) assert.doesNotThrow(() => P.setCardFee(cardsSrc, card.id, card.fee), card.id + ' fee');
    if (card.bonus) ['amount', 'spend', 'months'].forEach(k => {
      if (card.bonus[k] != null) assert.doesNotThrow(() => P.setCardBonus(cardsSrc, card.id, k, card.bonus[k]), card.id + ' welcome offer ' + k);
    });
    card.credits.forEach(c => assert.doesNotThrow(() => P.setCreditAmount(cardsSrc, card.id, c.id, c.amount), card.id + ' credit ' + c.id));
    assert.doesNotThrow(() => P.setCardAsOf(cardsSrc, card.id, '2026-10'), card.id + ' asOf');
  });
});
