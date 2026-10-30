const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

test('a v1 Netflix sub added at the old list price surfaces the rise', () => {
  const ctx = load({ today: '2026-10-27' });
  const st = ctx.ST.store.migrate({ region: 'US', currency: 'USD', subs: [
    { id: 'n', name: 'Netflix', serviceId: 'netflix', tierName: 'Standard', amount: 17.99, cur: 'USD', cycle: 'monthly' },
    { id: 'c', name: 'Custom thing', amount: 5, cur: 'USD' }
  ] });
  const W = ctx.ST.priceWatch;
  const ch = W.changeFor(st, st.subs[0]);
  assert.ok(ch, 'change detected');
  assert.equal(ch.now.amount, 19.99);
  assert.equal(ch.was.amount, 17.99);
  assert.ok(Math.abs(ch.yearUsd - 24) < 0.01);
  assert.equal(W.changeFor(st, st.subs[1]), null, 'custom subs have nothing to compare');
  const alerts = W.alerts(st);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /Netflix Standard is now \$19\.99/);
  assert.match(alerts[0].body, /about \$24 a year more/);
  st.settings.currency = 'GBP';
  assert.match(W.alerts(st)[0].body, /about £\d+ a year more/, 'the yearly difference is in the currency you chose');
});

test('accepting the change updates or just acknowledges', () => {
  const ctx = load({ today: '2026-10-27' });
  const W = ctx.ST.priceWatch;
  const st = ctx.ST.store.migrate({ region: 'US', subs: [
    { id: 'a', serviceId: 'netflix', tierName: 'Standard', amount: 17.99, cur: 'USD' },
    { id: 'b', serviceId: 'netflix', tierName: 'Standard', amount: 17.99, cur: 'USD' }
  ] });
  W.accept(st.subs[0], W.changeFor(st, st.subs[0]), true);
  W.accept(st.subs[1], W.changeFor(st, st.subs[1]), false);
  assert.equal(st.subs[0].amount, 19.99);
  assert.equal(st.subs[1].amount, 17.99, 'kept');
  assert.equal(W.changeFor(st, st.subs[0]), null);
  assert.equal(W.changeFor(st, st.subs[1]), null, 'acknowledged, no repeat alert');
});

test('a sub tracked in another currency is not guessed at', () => {
  const ctx = load();
  const st = ctx.ST.store.migrate({ region: 'IN', subs: [
    { id: 'a', serviceId: 'netflix', tierName: 'Standard', amount: 17.99, cur: 'USD' }
  ] });
  assert.equal(st.subs[0].quoted, null);
});
