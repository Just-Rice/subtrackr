const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

test('a passphrase key seals and opens; another passphrase or salt cannot', async () => {
  const V = load().ST.vault;
  const salt = V.random(16);
  const k = await V.fromPassphrase('correct horse battery', salt, 1000);
  const env = await V.seal(k, { a: 1, list: [1, 2] });
  assert.ok(!/list/.test(env), 'nothing readable in the envelope');
  assert.deepEqual(JSON.parse(JSON.stringify(await V.open(k, env))), { a: 1, list: [1, 2] });
  const wrong = await V.fromPassphrase('wrong horse battery', salt, 1000);
  await assert.rejects(V.open(wrong, env), /wrong key/);
  const other = await V.fromPassphrase('correct horse battery', V.random(16), 1000);
  await assert.rejects(V.open(other, env), /wrong key/);
});

test('a data key wrapped under two keys opens with either', async () => {
  const V = load().ST.vault;
  const raw = V.random(32);
  const prfKey = await V.fromSecret(V.random(32), 'subtrackr lock');
  const recoveryKey = await V.fromPassphrase('ABCD-EFGH-JKLM-NPQR', V.random(16), 1000);
  const w1 = await V.sealBytes(prfKey, raw);
  const w2 = await V.sealBytes(recoveryKey, raw);
  const dk1 = await V.fromRaw(await V.openBytes(prfKey, w1));
  const dk2 = await V.fromRaw(await V.openBytes(recoveryKey, w2));
  const env = await V.seal(dk1, { secret: 'yes' });
  assert.equal((await V.open(dk2, env)).secret, 'yes');
});

test('keys are not extractable', async () => {
  const V = load().ST.vault;
  const k = await V.fromRaw(V.random(32));
  assert.equal(k.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', k));
});

test('sync decides push, pull, conflict or nothing', () => {
  const A = load().ST.account;
  const me = 'dev1';
  assert.equal(A.decide({ dirty: false, lastSyncedAt: 0, hasData: true }, null, me), 'push', 'first upload');
  assert.equal(A.decide({ dirty: false, lastSyncedAt: 0, hasData: false }, null, me), 'none');
  assert.equal(A.decide({ dirty: true, lastSyncedAt: 100 }, { updatedAt: 100, device: me }, me), 'push');
  assert.equal(A.decide({ dirty: false, lastSyncedAt: 100 }, { updatedAt: 100, device: me }, me), 'none');
  assert.equal(A.decide({ dirty: false, lastSyncedAt: 100 }, { updatedAt: 200, device: 'dev2' }, me), 'pull');
  assert.equal(A.decide({ dirty: true, lastSyncedAt: 100 }, { updatedAt: 200, device: 'dev2' }, me), 'conflict');
  assert.equal(A.decide({ dirty: false, lastSyncedAt: 0, hasData: true }, { updatedAt: 200, device: 'dev2' }, me), 'conflict', 'a new device with its own data asks');
  assert.equal(A.decide({ dirty: false, lastSyncedAt: 0, hasData: false }, { updatedAt: 200, device: 'dev2' }, me), 'pull', 'an empty new device just takes the copy');
});

test('three-way merge keeps each side’s own changes', () => {
  const A = load().ST.account;
  const sub = (id, name) => ({ id, name, amount: 1 });
  const base = { subs: [sub('a', 'A'), sub('b', 'B'), sub('c', 'C'), sub('d', 'D')], cards: [], expenses: [], budgets: [{ cat: 'dining', amount: 100 }] };
  const fp = A.fingerprint(base);
  const local = { subs: [sub('a', 'A local'), sub('b', 'B'), sub('c', 'C both-local'), sub('e', 'E new here')], cards: [], expenses: [], budgets: [{ cat: 'dining', amount: 150 }], compare: ['netflix'] };
  const remote = { subs: [sub('a', 'A'), sub('b', 'B remote'), sub('c', 'C both-remote'), sub('d', 'D'), sub('f', 'F new there')], cards: [], expenses: [], budgets: [{ cat: 'dining', amount: 100 }], compare: ['spotify'] };
  const m = A.merge3(fp, local, remote);
  const names = Object.fromEntries(m.subs.map(s => [s.id, s.name]));
  assert.equal(names.a, 'A local', 'changed here only');
  assert.equal(names.b, 'B remote', 'changed there only');
  assert.equal(names.c, 'C both-remote', 'changed in both: the account wins');
  assert.equal(names.d, undefined, 'deleted here, untouched there: stays deleted');
  assert.equal(names.e, 'E new here');
  assert.equal(names.f, 'F new there');
  assert.equal(m.budgets[0].amount, 150);
  assert.deepEqual([...m.compare].sort(), ['netflix', 'spotify']);
});

test('recovery codes are long, readable and forgiving to type', () => {
  const L = load().ST.lock;
  const code = L.recoveryCode();
  assert.match(code, /^[2-9A-HJ-NP-Z]{5}(-[2-9A-HJ-NP-Z]{5}){4}$/);
  assert.notEqual(code, L.recoveryCode());
  assert.equal(L.normaliseCode(' ' + code.toLowerCase().replace(/-/g, ' ') + ' '), code.replace(/-/g, ''));
});

test('locked saves are ciphertext, and open again with the data key', async () => {
  const ctx = load();
  const S = ctx.ST.store, V = ctx.ST.vault, L = ctx.ST.lock;
  const state = S.migrate({ version: 2, settings: { region: 'US' }, subs: [{ id: 'n', name: 'Netflix', amount: 9, cur: 'USD' }] });
  const raw = V.random(32);
  const w = await L.wrapWithPassphrase(raw, 'ABCDE23456');
  S.setLockKey(await V.fromRaw(raw));
  await S.saveNowAsync(state, ctx.storage);
  const text = ctx.storage.getItem(S.KEY);
  assert.ok(!/Netflix/.test(text), 'nothing readable is stored');
  const loaded = S.load(ctx.storage);
  assert.equal(loaded.from, 'locked');
  const back = await V.open(await V.fromRaw(await L.unwrapWithPassphrase(w, 'ABCDE23456')), loaded.envelope);
  assert.equal(S.migrate(back).subs[0].name, 'Netflix');
  await assert.rejects(L.unwrapWithPassphrase(w, 'WRONG23456'));
  S.setLockKey(null);
});

test('erasing stops an encrypted save still on its way from bringing the data back', async () => {
  const ctx = load();
  const S = ctx.ST.store, V = ctx.ST.vault;
  S.setLockKey(await V.fromRaw(V.random(32)));
  const pending = S.saveNowAsync(S.migrate({ version: 2, subs: [{ id: 'n', name: 'Netflix', amount: 9, cur: 'USD' }] }), ctx.storage);
  S.wipe(ctx.storage);
  assert.equal(await pending, false);
  assert.equal(ctx.storage.getItem(S.KEY), null);
  S.setLockKey(null);
});

test('erasing the device removes every subtrackr entry, the v1 copy included, and leaves other sites alone', async () => {
  const ctx = load();
  const S = ctx.ST.store;
  ['subtrackr.v2', 'subtrackr.v1', 'subtrackr.lock', 'subtrackr.cloud', 'subtrackr.ai', 'subtrackr.sync', 'testprep.progress']
    .forEach(k => ctx.storage.setItem(k, '{}'));
  await S.eraseDevice(ctx.storage);
  assert.deepEqual(Object.keys(ctx.storage.dump()), ['testprep.progress']);
  assert.equal(S.load(ctx.storage).from, 'new', 'nothing comes back on the next load');
});
