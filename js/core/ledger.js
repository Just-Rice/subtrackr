/* ledger.js — what everything costs and when it is charged. Pure functions of
 * the saved state; the calendar, overview, budgets and alerts all read from it.
 *
 * Totals are carried in USD and converted for display. A subscription split
 * with others (shareCount) counts only your share everywhere.
 */

(function (ST) {
'use strict';

const M = ST.money, D = ST.dates, U = ST.util;

function share(sub) { return Math.max(1, sub.shareCount || 1); }

/* one charge, your share */
function chargeUsd(sub) { return M.toUsd(sub.amount, sub.cur) / share(sub); }
function monthlyUsd(sub) { return chargeUsd(sub) * M.cycle(sub.cycle).perMonth; }

function activeSubs(st) { return st.subs.filter(function (s) { return s.active; }); }
function subsMonthlyUsd(st) { return U.sum(activeSubs(st), monthlyUsd); }

function nextCharge(sub) {
  if (!sub.active || !sub.nextDate) return null;
  return D.nextOnOrAfter(sub.nextDate, sub.cycle);
}

function subSpendCat(sub) { return sub.group ? groupSpendCat(sub.group) : 'subscriptions'; }

/* ── expenses ── */

function expenseUsd(e) { return M.toUsd(e.amount, e.cur); }

function expensesBetween(st, from, to) {
  return st.expenses.filter(function (e) { return e.date >= from && e.date <= to; });
}

/* An expense linked to a tracked subscription is that subscription's charge
   showing up on a statement — counting both would double it. */
function looseExpenses(list) { return list.filter(function (e) { return !e.subId; }); }

function monthSpendUsd(st, key) {
  const b = D.monthBounds(key);
  return U.sum(looseExpenses(expensesBetween(st, b.from, b.to)), expenseUsd);
}

/* { rootCategory: usd } for a month: loose expenses plus each active
   subscription's monthly equivalent */
function categoryTotals(st, key, opts) {
  const o = opts || {};
  const out = {};
  function add(cat, v) { const r = spendRoot(cat); out[r] = (out[r] || 0) + v; }
  const b = D.monthBounds(key);
  looseExpenses(expensesBetween(st, b.from, b.to)).forEach(function (e) { add(e.cat, expenseUsd(e)); });
  if (!o.expensesOnly) activeSubs(st).forEach(function (s) { add(subSpendCat(s), monthlyUsd(s)); });
  return out;
}

/* ── events ── */

const KIND_ORDER = { trial: 0, credit: 1, fee: 2, charge: 3 };

/* everything dated in [from, to]:
   { date, kind: charge|fee|credit|trial, title, detail, usd, color, ref: { type, id } } */
function events(st, from, to) {
  let out = [];
  activeSubs(st).forEach(function (s) {
    if (s.nextDate) {
      D.occurrences(s.nextDate, s.cycle, from, to).forEach(function (d) {
        out.push({ date: d, kind: 'charge', title: s.name, detail: s.tierName || M.cycle(s.cycle).label,
                   usd: chargeUsd(s), color: s.color, ref: { type: 'sub', id: s.id } });
      });
    }
    /* the last day you can cancel is the day before the first charge */
    if (s.trialEnds) {
      const cancelBy = D.addDays(s.trialEnds, -1);
      if (cancelBy >= from && cancelBy <= to) {
        out.push({ date: cancelBy, kind: 'trial', title: s.name + ' trial', detail: 'Last day to cancel',
                   usd: chargeUsd(s), color: s.color, ref: { type: 'sub', id: s.id } });
      }
    }
  });
  if (ST.cardvalue) out = out.concat(ST.cardvalue.events(st, from, to));
  return out.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
}

/* the next n money-moving events from today */
function upcoming(st, n, days) {
  const from = D.todayStr();
  return events(st, from, D.addDays(from, days || 60))
    .filter(function (e) { return e.kind === 'charge' || e.kind === 'fee'; })
    .slice(0, n);
}

ST.ledger = { share: share, chargeUsd: chargeUsd, monthlyUsd: monthlyUsd, activeSubs: activeSubs,
              subsMonthlyUsd: subsMonthlyUsd, nextCharge: nextCharge, subSpendCat: subSpendCat,
              expenseUsd: expenseUsd, expensesBetween: expensesBetween, looseExpenses: looseExpenses,
              monthSpendUsd: monthSpendUsd, categoryTotals: categoryTotals, events: events, upcoming: upcoming };

})(window.ST = window.ST || {});
