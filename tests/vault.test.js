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
