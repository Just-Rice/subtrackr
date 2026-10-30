const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./load');

const V1 = {
  region: 'IN', currency: 'INR', theme: 'dark',
  subs: [
    { id: 'a', name: 'Evil', amount: -5, cur: 'USD', cycle: 'monthly', color: 'red;background-image:url(x)', active: 'false' },
    { id: 'b', name: 'Netflix', serviceId: 'netflix', tierName: 'Standard', amount: 499, cur: 'INR', cycle: 'monthly', nextDate: '2026-11-03', color: '#E50914' },
    { id: 'b', name: 'Duplicate id', amount: 1, cur: 'XXX', cycle: 'fortnightly', nextDate: '2026-02-30' },
    'not an object'
  ],
  compare: ['netflix', 'no-such-service']
};

test('v1 saved data migrates to v2 and keeps the v1 key as a backup', () => {
  const ctx = load();
  ctx.storage.setItem('subtrackr.v1', JSON.stringify(V1));
  const { state, from } = ctx.ST.store.load(ctx.storage);
  assert.equal(from, 'v1');
  assert.equal(state.version, 2);
  assert.deepEqual(plain(state.settings), { region: 'IN', currency: 'INR', theme: 'dark', textsize: 'medium' });
  assert.equal(state.subs.length, 3);
  assert.deepEqual(plain(state.compare), ['netflix']);
  assert.deepEqual(plain(state.cards), []);
  assert.ok(ctx.storage.getItem('subtrackr.v1'), 'v1 left in place');
});

test('sanitise pins hostile and broken fields', () => {
  const ctx = load();
  const st = ctx.ST.store.migrate(V1);
  const [evil, netflix, dup] = st.subs;
  assert.equal(evil.color, '#888888');
  assert.equal(evil.amount, 0);
  assert.equal(evil.active, false);
  assert.equal(netflix.nextDate, '2026-11-03');
  assert.notEqual(dup.id, 'b', 'duplicate id reassigned');
  assert.equal(dup.cur, 'USD');
  assert.equal(dup.cycle, 'monthly');
  assert.equal(dup.nextDate, '');
  const odd = ctx.ST.store.migrate({ version: 2, settings: { region: 'US', textsize: 'huge' } });
  assert.equal(odd.settings.textsize, 'medium', 'unknown text size falls back');
});

test('v2 round trip through save and load', () => {
  const ctx = load();
  const S = ctx.ST.store;
  const st = S.migrate(V1);
  st.cards.push(S.cleanCard({ name: 'Platinum', fee: 895, creditLog: { uber: { '2026-10': 15, 'bogus': 3 } } }));
  st.expenses.push(S.cleanExpense({ date: '2026-10-20', amount: 42.5, cat: 'dining', merchant: ' Cafe ' }));
  assert.ok(S.saveNow(st, ctx.storage));
  const back = S.load(ctx.storage);
  assert.equal(back.from, 'v2');
  assert.deepEqual(plain(back.state.cards[0].creditLog), { uber: { '2026-10': 15 } });
  assert.equal(back.state.expenses[0].merchant, 'Cafe');
  assert.equal(back.state.subs.length, 3);
});

test('a corrupt v2 key falls back to v1 rather than wiping the user', () => {
  const ctx = load();
  ctx.storage.setItem('subtrackr.v2', '{nope');
  ctx.storage.setItem('subtrackr.v1', JSON.stringify(V1));
  assert.equal(ctx.ST.store.load(ctx.storage).from, 'v1');
});

test('parseImport accepts v1 and v2 exports and rejects junk', () => {
  const ctx = load();
  const S = ctx.ST.store;
  assert.equal(S.parseImport(JSON.stringify({ exportedAt: 'x', state: V1 })).subs.length, 3);
  const v2 = S.exportPayload(S.migrate(V1));
  assert.equal(S.parseImport(JSON.stringify(v2)).settings.region, 'IN');
  assert.throws(() => S.parseImport('{"hello": 1}'));
  assert.throws(() => S.parseImport('not json'));
});

test('merge updates matching ids and appends new ones', () => {
  const ctx = load();
  const S = ctx.ST.store;
  const target = S.migrate(V1);
  const incoming = S.migrate({ version: 2, subs: [{ id: 'b', name: 'Netflix (new)' }, { id: 'z', name: 'New' }],
                               budgets: [{ cat: 'dining', amount: 300, cur: 'USD' }] });
  const counts = S.merge(target, incoming);
  assert.deepEqual({ ...counts }, { added: 1, updated: 1 });
  assert.equal(target.subs.find(s => s.id === 'b').name, 'Netflix (new)');
  assert.equal(target.budgets.length, 1);
});

test('wipe cancels a pending save', async () => {
  const ctx = load();
  const S = ctx.ST.store;
  ctx.window.localStorage = ctx.storage;
  S.save(S.migrate(V1));
  S.wipe(ctx.storage);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(ctx.storage.getItem('subtrackr.v2'), null);
});

test('a statement line linked to a subscription that no longer exists counts as spending again', () => {
  const { ST } = load();
  const st = ST.store.migrate({ version: 2, subs: [{ id: 'n', name: 'Netflix', amount: 19.99, cur: 'USD' }],
    expenses: [{ id: 'a', date: '2026-10-01', amount: 19.99, cur: 'USD', merchant: 'NETFLIX.COM', subId: 'n' },
               { id: 'b', date: '2026-10-01', amount: 9.99, cur: 'USD', merchant: 'HULU', subId: 'gone' }] });
  assert.equal(st.expenses.find(e => e.id === 'a').subId, 'n');
  assert.equal(st.expenses.find(e => e.id === 'b').subId, '');
});
