const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

function state(ctx) {
  return ctx.ST.store.migrate({ version: 2, settings: { region: 'US', currency: 'USD' },
    subs: [{ id: 'n', name: 'Netflix', serviceId: 'netflix', tierName: 'Premium', amount: 26.99, cur: 'USD', group: 'video.movies', notes: 'family password is hunter2' },
           { id: 's', name: 'Spotify', amount: 21.99, cur: 'USD', group: 'audio.music', shareCount: 3 }],
    expenses: [{ id: 'e1', date: '2026-10-05', merchant: 'WHOLE FOODS 1234 ACCT 998877', amount: 80, cur: 'USD', cat: 'groceries', note: 'secret note' },
               { id: 'e2', date: '2026-10-06', merchant: 'ZZ MYSTERY LLC', amount: 12, cur: 'USD', cat: 'other' },
               { id: 'e3', date: '2026-10-07', merchant: 'zz mystery llc', amount: 13, cur: 'USD', cat: 'other' }],
    budgets: [{ cat: 'groceries', amount: 400, cur: 'USD' }] });
}

test('the summary carries figures and names, never ids, notes or shop names', () => {
  const ctx = load({ today: '2026-10-20' });
  const sum = ctx.ST.aidata.summary(state(ctx));
  const text = JSON.stringify(sum);
  assert.equal(sum.month, '2026-10');
  assert.equal(sum.subscriptions.length, 2);
  assert.equal(sum.subscriptions[1].splitWays, 3);
  assert.equal(sum.subscriptions[1].perMonth, 7.33);
  assert.ok(sum.spendingThisMonth.Groceries === 80);
  assert.equal(sum.budgets[0].limit, 400);
  for (const leak of ['hunter2', 'secret note', 'WHOLE FOODS', '998877', 'MYSTERY', '"n"', 'e1']) assert.ok(!text.includes(leak), 'no ' + leak);
});

test('categorising sends each unplaced shop name once', () => {
  const ctx = load({ today: '2026-10-20' });
  const st = state(ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ST.aidata.merchants(st.expenses))), ['ZZ MYSTERY LLC']);
  const prompt = ctx.ST.aidata.categorisePrompt(['ZZ MYSTERY LLC']);
  assert.match(prompt, /groceries \(Groceries\)/);
  assert.ok(!/\bother \(/.test(prompt), 'the catch-all is not offered');
});

test('answers are escaped and lightly formatted', () => {
  const ctx = load();
  const html = ctx.ST.aidata.renderAnswer('Hi <script>x</script> **$40** saved.\n\n- one\n- two');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<strong>\$40<\/strong>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});
