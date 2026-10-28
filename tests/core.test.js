const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./load');

const ctx = load({ today: '2026-10-27' });
const { money: M, dates: D, pricing: P, util: U } = ctx.ST;

test('fmtMoney: sign before symbol, no NaN, zero-decimal currencies', () => {
  assert.equal(M.fmtMoney(-5, 'USD'), '-$5.00');
  assert.equal(M.fmtMoney(NaN, 'USD'), '$—');
  assert.equal(M.fmtMoney(12345, 'INR'), '₹12,345');
  assert.equal(M.fmtMoney(3.5, 'USD', { sign: true }), '+$3.50');
});

test('rates: live table wins, static table is the fallback', () => {
  assert.equal(M.rate('INR'), ctx.get('CURRENCIES').INR.rate);
  M.setRates({ INR: 90 });
  assert.equal(M.rate('INR'), 90);
  assert.equal(M.rate('GBP'), ctx.get('CURRENCIES').GBP.rate, 'missing live rate falls back');
  M.setRates(null);
});

test('parseYmd rejects impossible dates', () => {
  assert.equal(D.parseYmd('2026-02-30'), null);
  assert.equal(D.parseYmd('2026-13-01'), null);
  assert.ok(D.parseYmd('2028-02-29'));
});

test('month arithmetic clamps and keeps the anchor day', () => {
  assert.equal(D.addCycle('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(D.addCycle('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(D.addCycle('2026-10-27', 'fourweekly'), '2026-11-24');
});

test('nextOnOrAfter rolls a stale date forward; occurrences lists a window', () => {
  assert.equal(D.nextOnOrAfter('2026-01-15', 'monthly'), '2026-11-15');
  assert.equal(D.nextOnOrAfter('2026-10-27', 'monthly'), '2026-10-27', 'today counts');
  assert.deepEqual(plain(D.occurrences('2026-01-05', 'monthly', '2026-10-01', '2026-12-31')),
    ['2026-10-05', '2026-11-05', '2026-12-05']);
  assert.deepEqual(plain(D.occurrences('2026-10-01', 'weekly', '2026-10-20', '2026-11-02')),
    ['2026-10-22', '2026-10-29']);
});

test('weekStart is the Monday', () => {
  assert.equal(D.weekStart('2026-10-27'), '2026-10-26');
  assert.equal(D.weekStart('2026-11-01'), '2026-10-26', 'Sunday belongs to the week before');
});

test('tierPrice: exact local, estimate elsewhere, null where not sold', () => {
  const svc = ctx.get('SERVICE_BY_ID').netflix;
  const std = P.findTier(svc, 'Standard');
  assert.equal(P.tierPrice(std, 'US').exact, true);
  const est = P.tierPrice(std, 'MX');
  assert.equal(est.exact, false);
  assert.ok(est.local.amount > 0);
  assert.equal(P.tierPrice(P.findTier(svc, 'Mobile'), 'US'), null);
});

test('soldHere uses tier availability, not just service markets', () => {
  const hulu = ctx.get('SERVICE_BY_ID').hulu;
  assert.equal(P.availableHere(hulu, 'IN'), true);
  assert.equal(P.soldHere(hulu, 'IN'), false);
  assert.equal(P.soldHere(hulu, 'US'), true);
});

test('safeColor and num', () => {
  assert.equal(U.safeColor('red;background:url(x)'), '#888888');
  assert.equal(U.safeColor('#A1b2C3'), '#A1b2C3');
  assert.equal(U.num(-4, 0), 0);
  assert.equal(U.num('7.5'), 7.5);
});
