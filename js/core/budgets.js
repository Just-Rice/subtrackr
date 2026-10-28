/* budgets.js — monthly limits per spending category, and the recurring
 * charges in your expenses that look like subscriptions you are not tracking.
 */

(function (ST) {
'use strict';

const D = ST.dates, M = ST.money, U = ST.util, L = ST.ledger;

/* → [{ budget, cat, spentUsd, limitUsd, frac, over, leftUsd }] for a month */
function status(st, key) {
  const totals = L.categoryTotals(st, key || D.monthKey(D.todayStr()));
  return st.budgets.filter(function (b) { return b.amount > 0; }).map(function (b) {
    const root = spendRoot(b.cat);
    const spent = totals[root] || 0;
    const limit = M.toUsd(b.amount, b.cur);
    return { budget: b, cat: SPEND_CAT_BY_ID[root], spentUsd: spent, limitUsd: limit,
             frac: limit ? spent / limit : 0, over: spent > limit, leftUsd: limit - spent };
  }).sort(function (a, b) { return b.frac - a.frac; });
}

function alerts(st) {
  const key = D.monthKey(D.todayStr());
  return status(st, key).filter(function (s) { return s.over; }).map(function (s) {
    return { id: 'budget:' + s.budget.cat + ':' + key, priority: 3, tone: 'warn', date: '',
      title: s.cat.name + ' is ' + M.fmtMoney(s.spentUsd - s.limitUsd, 'USD', { dec: 0 }) + ' over budget',
      body: M.fmtMoney(s.spentUsd, 'USD', { dec: 0 }) + ' of ' + M.fmtMoney(s.limitUsd, 'USD', { dec: 0 }) + ' this month.',
      action: { type: 'budget' } };
  });
}

/* ── recurring charges you are not tracking ── */

const CYCLE_DAYS = [['weekly', 7, 2], ['fourweekly', 28, 2], ['monthly', 30.4, 4], ['quarterly', 91, 7], ['yearly', 365, 10]];

/* Three or more charges from one merchant, at a steady amount (±10%) and a
   steady interval, that no tracked subscription already covers. */
function recurring(st) {
  const groups = {};
  st.expenses.forEach(function (e) {
    if (e.subId || e.amount <= 0) return;
    const k = ST.csv ? ST.csv.norm(e.merchant).replace(/\d+/g, '').trim() : e.merchant.toLowerCase();
    if (!k) return;
    (groups[k] = groups[k] || []).push(e);
  });
  const out = [];
  Object.keys(groups).forEach(function (k) {
    const list = groups[k].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (list.length < 3 || st.dismissed['recur:' + k]) return;
    if (ST.csv && ST.csv.matchSub(st, list[0].merchant)) return;
    const amounts = list.map(function (e) { return e.amount; }).sort(function (a, b) { return a - b; });
    const median = amounts[Math.floor(amounts.length / 2)];
    if (!list.every(function (e) { return Math.abs(e.amount - median) <= median * 0.1; })) return;
    const gaps = [];
    for (let i = 1; i < list.length; i++) gaps.push(D.daysBetween(list[i - 1].date, list[i].date));
    const gap = gaps.slice().sort(function (a, b) { return a - b; })[Math.floor(gaps.length / 2)];
    /* the closest cycle within tolerance — 30-day gaps are monthly, not every 28 days */
    const cyc = CYCLE_DAYS.filter(function (c) { return Math.abs(gap - c[1]) <= c[2]; })
      .sort(function (a, b) { return Math.abs(gap - a[1]) - Math.abs(gap - b[1]); })[0];
    if (!cyc || !gaps.every(function (g) { return Math.abs(g - cyc[1]) <= cyc[2] * 2; })) return;
    const last = list[list.length - 1];
    out.push({ key: k, merchant: last.merchant, amount: last.amount, cur: last.cur, cat: last.cat, cycle: cyc[0],
               count: list.length, last: last.date, next: D.addCycle(last.date, cyc[0]), ids: list.map(function (e) { return e.id; }),
               yearUsd: M.toUsd(last.amount, last.cur) * M.cycle(cyc[0]).perMonth * 12 });
  });
  return out.sort(function (a, b) { return b.yearUsd - a.yearUsd; });
}

ST.budgets = { status: status, alerts: alerts, recurring: recurring };

})(window.ST = window.ST || {});
