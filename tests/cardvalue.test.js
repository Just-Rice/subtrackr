const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./load');

const TODAY = '2026-10-27';

function setup(cards, extra) {
  const ctx = load({ today: TODAY });
  const S = ctx.ST.store;
  const st = S.migrate(Object.assign({ version: 2, settings: { region: 'US' }, cards: cards }, extra || {}));
  return { ctx, st, V: ctx.ST.cardvalue };
}

test('card-year runs from the last fee date to the next', () => {
  const { V, st } = setup([{ id: 'p', cardId: 'amex-platinum', fee: 895, feeDate: '2026-03-12' }]);
  assert.deepEqual(plain(V.cardYear(st.cards[0], TODAY)), { from: '2026-03-12', to: '2027-03-11', next: '2027-03-12' });
  assert.deepEqual(plain(V.cardYear(st.cards[0], '2026-03-12')), { from: '2026-03-12', to: '2027-03-11', next: '2027-03-12' }, 'fee day starts the new year');
  const noFee = setup([{ id: 'x', cardId: 'chase-cfu' }]);
  assert.deepEqual(plain(noFee.V.cardYear(noFee.st.cards[0], TODAY)), { from: '2026-01-01', to: '2026-12-31', next: null });
});

test('period keys and bounds for each cadence', () => {
  const { V } = setup([]);
  const cy = { from: '2026-03-12', to: '2027-03-11' };
  assert.equal(V.periodKey('2026-10-27', 'monthly', cy), '2026-10');
  assert.equal(V.periodKey('2026-10-27', 'quarterly', cy), '2026-Q4');
  assert.equal(V.periodKey('2026-10-27', 'semiannual', cy), '2026-H2');
  assert.equal(V.periodKey('2026-10-27', 'yearly', cy), '2026');
  assert.equal(V.periodKey('2026-10-27', 'cardyear', cy), 'cy-2026-03-12');
  assert.deepEqual(plain(V.periodBounds('2026-10-27', 'quarterly', cy)), { from: '2026-10-01', to: '2026-12-31' });
  assert.equal(V.periodsInYear('monthly', cy).length, 12);
  assert.equal(V.periodsInYear('semiannual', cy).length, 2);
});

test('Platinum: credits used vs potential, getting vs could, break-even', () => {
  const { V, st } = setup([{ id: 'p', cardId: 'amex-platinum', fee: 895, feeDate: '2027-01-15', cpp: 1.2,
    creditLog: { uber: { '2026-10': 15, '2026-09': 15 }, stream: { '2026-10': 25 }, resy: { '2026-Q4': 100 } } }]);
  const v = V.value(st, st.cards[0], TODAY);
  assert.equal(v.creditsUsed, 155);
  /* 12×15 + 20 + 120 + 12×25 + 2×300 + 4×100 + 4×75 + 200 + 209 + 12×12.95 + 200 + 300 */
  assert.equal(Math.round(v.creditsPotential * 100) / 100, 180 + 20 + 120 + 300 + 600 + 400 + 300 + 200 + 209 + 155.4 + 200 + 300);
  assert.equal(Math.round(v.getting), 155 - 895);
  assert.ok(v.could > 0, 'full use pays for the fee');
  assert.equal(Math.round(v.breakEven), 895 - 155);
  const uberNow = v.credits.find(c => c.credit.id === 'uber').now;
  assert.equal(uberNow.available, 0);
  assert.equal(uberNow.daysLeft, 4);
});

test('rewards: estimate, paid-with subscriptions and logged expenses all count', () => {
  const { V, st } = setup([{ id: 'g', cardId: 'amex-gold', fee: 325, cpp: 1.2, spend: { dining: 500 } }], {
    subs: [{ id: 's', name: 'Netflix', amount: 19.99, cur: 'USD', group: 'video.movies', paidWith: 'g' }],
    expenses: [{ id: 'e', date: '2026-10-01', amount: 100, cur: 'USD', cat: 'dining', cardId: 'g' }]
  });
  const card = st.cards[0];
  assert.equal(V.multiplier(card, 'dining'), 4);
  assert.equal(V.multiplier(card, 'streaming'), 1, 'falls back to other');
  assert.equal(V.multiplier(card, 'hotels'), 1, 'child with no rate and no parent rate → other');
  const v = V.value(st, card, TODAY);
  const perMonth = 500 * 0.048 + 19.99 * 0.012;
  assert.ok(Math.abs(v.rewardsProjected - (perMonth * 12 + 4.8 / v.elapsed)) < 0.01);
});

test('coverFor links a subscription to the credit that pays for it', () => {
  const { V, st } = setup([{ id: 'p', cardId: 'amex-platinum', fee: 895 }], {
    subs: [{ id: 'd', name: 'Disney+', serviceId: 'disneyplus', amount: 21.49, cur: 'USD' },
           { id: 'n', name: 'Netflix', serviceId: 'netflix', amount: 19.99, cur: 'USD' }]
  });
  const cov = V.coverFor(st, st.subs[0]);
  assert.equal(cov.credit.id, 'stream');
  assert.equal(Math.round(cov.yearUsd * 100) / 100, 257.88, 'capped at what the sub actually costs');
  assert.equal(V.coverFor(st, st.subs[1]), null);
});

test('bestCardFor picks the highest return', () => {
  const { V, st } = setup([{ id: 'g', cardId: 'amex-gold', cpp: 1.2 }, { id: 'b', cardId: 'amex-bcp', cpp: 1 }]);
  assert.equal(V.bestCardFor(st, 'groceries').card.id, 'b', '6% beats 4.8%');
  assert.equal(V.bestCardFor(st, 'dining').card.id, 'g');
});

test('sign-up bonus tracks expenses after opening and warns near the deadline', () => {
  const { V, st, ctx } = setup([{ id: 'c', cardId: 'chase-csp', cpp: 1.25, openedAt: '2026-09-01',
    bonus: { spent: 0, deadline: '2026-11-15' } }], {
    expenses: [{ id: 'e1', date: '2026-09-10', amount: 2000, cur: 'USD', cat: 'other', cardId: 'c' },
               { id: 'e2', date: '2026-08-10', amount: 9000, cur: 'USD', cat: 'other', cardId: 'c' }]
  });
  const b = V.bonus(st, st.cards[0], TODAY);
  assert.equal(b.spent, 2000, 'spending before opening does not count');
  assert.equal(b.left, 3000);
  assert.equal(b.worth, 937.5);
  const a = V.alerts(st).find(x => x.id === 'bonus:c');
  assert.ok(a);
  assert.match(a.title, /Spend \$3,000\.00 more on Sapphire Preferred/);
});

test('credit expiry alert fires in the last days of the period, not before', () => {
  const late = setup([{ id: 'g', cardId: 'amex-gold' }]);
  const ids = late.V.alerts(late.st).map(a => a.id);
  assert.ok(ids.includes('credit:g:uber:2026-10'), 'Uber Cash with 4 days left');
  late.ctx.ST.dates.setToday('2026-10-10');
  assert.ok(!late.V.alerts(late.st).some(a => a.id === 'credit:g:uber:2026-10'));
});

test('calendar events: fee date and credits lapsing this period', () => {
  const { ctx, st } = setup([{ id: 'p', cardId: 'amex-platinum', fee: 895, feeDate: '2026-11-04' }]);
  const evs = ctx.ST.ledger.events(st, '2026-10-26', '2026-11-22');
  const fee = evs.find(e => e.kind === 'fee');
  assert.equal(fee.date, '2026-11-04');
  assert.equal(fee.usd, 895);
  const credit = evs.find(e => e.kind === 'credit' && e.date === '2026-10-31');
  assert.ok(credit, 'monthly credits lapse at month end');
});

test('calendar credits map onto an off-calendar card-year by midpoint', () => {
  const { V } = setup([]);
  const cy = { from: '2025-11-16', to: '2026-11-15' };
  const q = V.periodsInYear('quarterly', cy).map(p => p.key);
  assert.deepEqual(plain(q), ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'], 'the running quarter is this year\'s');
  assert.deepEqual(plain(V.periodsInYear('yearly', cy).map(p => p.key)), ['2026']);
  assert.equal(V.periodsInYear('monthly', cy).length, 12);
  assert.equal(V.periodsInYear('monthly', cy)[0].key, '2025-12');
  assert.equal(V.periodsInYear('monthly', cy)[11].key, '2026-11', 'Nov 1–15 is mostly this card-year');
});
