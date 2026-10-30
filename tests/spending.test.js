const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./load');

const TODAY = '2026-10-27';

test('CSV parser: quotes, doubled quotes, CRLF, BOM, semicolons', () => {
  const { ST } = load();
  assert.deepEqual(plain(ST.csv.parse('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2')), [['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
  assert.deepEqual(plain(ST.csv.parse('Datum;Betrag\n01.10.2026;-12,50')), [['Datum', 'Betrag'], ['01.10.2026', '-12,50']]);
});

test('amounts in every shape statements use', () => {
  const { ST } = load();
  const p = ST.csv.parseAmount;
  assert.equal(p('$1,234.56'), 1234.56);
  assert.equal(p('(12.00)'), -12);
  assert.equal(p('-12.00'), -12);
  assert.equal(p('12.00 CR'), -12);
  assert.equal(p('1.234,56'), 1234.56);
  assert.equal(p('₹ 1,23,456'), 123456);
  assert.equal(p('£4.5'), 4.5);
  assert.equal(p('−12.00'), -12, 'a typographic minus');
  assert.equal(p(''), null);
});

test('two identical purchases on one day both count; importing the file again adds neither', () => {
  const ctx = load();
  const rows = ctx.ST.csv.parse('Date,Description,Amount\n10/01/2026,MTA*NYCT PAYGO,2.90\n10/01/2026,MTA*NYCT PAYGO,2.90\n10/02/2026,Pret A Manger,6.50');
  const map = ctx.ST.csv.guessMapping(rows, 'US');
  const st = ctx.ST.store.freshState();
  const first = ctx.ST.csv.toExpenses(rows, map, { cur: 'USD', st });
  assert.equal(first.expenses.length, 3);
  assert.equal(first.duplicates, 0);
  st.expenses.push(...first.expenses);
  const again = ctx.ST.csv.toExpenses(rows, map, { cur: 'USD', st });
  assert.equal(again.expenses.length, 0);
  assert.equal(again.duplicates, 3);
});

test('a short subscription name only matches as a word of its own', () => {
  const ctx = load();
  const st = ctx.ST.store.migrate({ version: 2, subs: [{ id: 'm', name: 'Max', amount: 9.99, cur: 'USD' }, { id: 'n', name: 'Netflix', amount: 19.99, cur: 'USD' }] });
  const m = merchant => (ctx.ST.csv.matchSub(st, merchant) || {}).id || null;
  assert.equal(m('MAX.COM 855-442-6629'), 'm');
  assert.equal(m("MAXWELL'S CAFE"), null);
  assert.equal(m('NETFLIXCOM LOS GATOS'), 'n', 'a longer name may run into other text');
});

test('dates: ISO, named months, and day/month order from the data', () => {
  const { ST } = load();
  const d = ST.csv.parseDate;
  assert.equal(d('2026-10-03'), '2026-10-03');
  assert.equal(d('03 Oct 2026'), '2026-10-03');
  assert.equal(d('Oct 3, 2026'), '2026-10-03');
  assert.equal(d('10/03/2026', 'mdy'), '2026-10-03');
  assert.equal(d('10/03/2026', 'dmy'), '2026-03-10');
  assert.equal(d('31/02/2026', 'dmy'), null, 'impossible date rejected');
  assert.equal(ST.csv.detectOrder(['01/10/2026', '25/10/2026'], 'US'), 'dmy', 'a 25 in the first slot settles it');
  assert.equal(ST.csv.detectOrder(['01/02/2026'], 'US'), 'mdy', 'ambiguous → market habit');
});

test('mapping a typical US card export with negative spending', () => {
  const ctx = load({ today: TODAY });
  const csv = 'Transaction Date,Post Date,Description,Category,Type,Amount\n' +
    '10/01/2026,10/02/2026,NETFLIX.COM,Entertainment,Sale,-19.99\n' +
    '10/03/2026,10/04/2026,WHOLE FOODS MARKET #123,Groceries,Sale,-84.12\n' +
    '10/05/2026,10/06/2026,UBER   TRIP,Travel,Sale,-23.40\n' +
    '10/07/2026,10/08/2026,UBER EATS,Food,Sale,-31.00\n' +
    '10/09/2026,10/09/2026,Payment Thank You,,Payment,500.00';
  const rows = ctx.ST.csv.parse(csv);
  const map = ctx.ST.csv.guessMapping(rows, 'US');
  assert.equal(map.date, 0);
  assert.equal(map.amount, 5);
  assert.equal(map.merchant, 2);
  assert.equal(map.flip, true);
  const st = ctx.ST.store.migrate({ version: 2, subs: [{ id: 'n', name: 'Netflix', amount: 19.99, cur: 'USD', group: 'video.movies', paidWith: 'card1' }] });
  const res = ctx.ST.csv.toExpenses(rows, map, { cur: 'USD', st });
  assert.equal(res.expenses.length, 4);
  assert.equal(res.credits, 1, 'the payment is not spending');
  const [nf, wf, uber, eats] = res.expenses;
  assert.equal(nf.subId, 'n', 'linked to the tracked subscription');
  assert.equal(nf.cardId, 'card1');
  assert.equal(wf.cat, 'groceries');
  assert.equal(uber.cat, 'transit');
  assert.equal(eats.cat, 'dining');
  st.expenses.push(...res.expenses);
  const again = ctx.ST.csv.toExpenses(rows, map, { cur: 'USD', st });
  assert.equal(again.expenses.length, 0);
  assert.equal(again.duplicates, 4, 'importing the same file twice adds nothing');
});

test('mapping a UK bank export with money out / money in columns', () => {
  const ctx = load();
  const rows = ctx.ST.csv.parse('Date,Description,Money Out,Money In,Balance\n25/10/2026,TESCO STORES 2041,42.10,,1000.00\n26/10/2026,SALARY,,2500.00,3457.90');
  const map = ctx.ST.csv.guessMapping(rows, 'GB');
  assert.equal(map.order, 'dmy');
  assert.equal(map.debit, 2);
  assert.equal(map.credit, 3);
  const res = ctx.ST.csv.toExpenses(rows, map, { cur: 'GBP' });
  assert.equal(res.expenses.length, 1);
  assert.equal(res.expenses[0].date, '2026-10-25');
  assert.equal(res.expenses[0].cat, 'groceries');
});

test('budgets compare a month of spending, subscriptions included', () => {
  const ctx = load({ today: TODAY });
  const st = ctx.ST.store.migrate({ version: 2,
    subs: [{ id: 's', name: 'Spotify', amount: 12.99, cur: 'USD', group: 'audio.music' }],
    expenses: [{ date: '2026-10-02', amount: 250, cur: 'USD', cat: 'dining' }, { date: '2026-10-12', amount: 80, cur: 'USD', cat: 'dining' },
               { date: '2026-09-30', amount: 999, cur: 'USD', cat: 'dining' }],
    budgets: [{ cat: 'dining', amount: 300, cur: 'USD' }, { cat: 'subscriptions', amount: 50, cur: 'USD' }] });
  const s = ctx.ST.budgets.status(st, '2026-10');
  const dining = s.find(x => x.cat.id === 'dining');
  assert.equal(dining.spentUsd, 330);
  assert.equal(dining.over, true);
  const subs = s.find(x => x.cat.id === 'subscriptions');
  assert.ok(Math.abs(subs.spentUsd - 12.99) < 0.001, 'streaming rolls up to subscriptions');
  const a = ctx.ST.budgets.alerts(st);
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Dining out is \$30 over budget/);
  st.settings.currency = 'GBP';
  assert.match(ctx.ST.budgets.alerts(st)[0].title, /Dining out is £\d+ over budget/, 'shown in the currency you chose');
});

test('recurring charges that look like an untracked subscription', () => {
  const ctx = load({ today: TODAY });
  const ex = (date, merchant, amount) => ({ date, merchant, amount, cur: 'USD', cat: 'other' });
  const st = ctx.ST.store.migrate({ version: 2,
    subs: [{ id: 'n', name: 'Netflix', amount: 19.99, cur: 'USD' }],
    expenses: [
      ex('2026-07-14', 'PATREON* MEMBERSHIP', 8.00), ex('2026-08-14', 'PATREON* MEMBERSHIP', 8.00),
      ex('2026-09-14', 'PATREON* MEMBERSHIP', 8.00), ex('2026-10-14', 'PATREON* MEMBERSHIP', 8.00),
      ex('2026-08-01', 'NETFLIX.COM', 19.99), ex('2026-09-01', 'NETFLIX.COM', 19.99), ex('2026-10-01', 'NETFLIX.COM', 19.99),
      ex('2026-08-03', 'SHELL OIL 123', 40), ex('2026-08-20', 'SHELL OIL 123', 61), ex('2026-10-02', 'SHELL OIL 123', 38)
    ] });
  const r = ctx.ST.budgets.recurring(st);
  assert.equal(r.length, 1, 'Netflix is tracked, fuel is irregular');
  assert.equal(r[0].cycle, 'monthly');
  assert.equal(r[0].next, '2026-11-14');
  st.dismissed['recur:' + r[0].key] = true;
  assert.equal(ctx.ST.budgets.recurring(st).length, 0, 'dismissed stays dismissed');
});

test('30-day gaps read as monthly, 28-day gaps as every 28 days', () => {
  const ctx = load({ today: TODAY });
  const ex = (date, merchant) => ({ date, merchant, amount: 5, cur: 'USD' });
  const st = ctx.ST.store.migrate({ version: 2, expenses: [
    ex('2026-07-21', 'A'), ex('2026-08-20', 'A'), ex('2026-09-19', 'A'),
    ex('2026-08-01', 'B'), ex('2026-08-29', 'B'), ex('2026-09-26', 'B')] });
  const r = Object.fromEntries(ctx.ST.budgets.recurring(st).map(x => [x.merchant, x.cycle]));
  assert.deepEqual(r, { A: 'monthly', B: 'fourweekly' });
});
