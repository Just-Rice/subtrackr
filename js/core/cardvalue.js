/* cardvalue.js — what a credit card is worth to you.
 *
 *   getting now = credits used this card-year + rewards earned so far
 *                 + perks you value − the annual fee
 *   could get   = every credit used + a full year of rewards + perks − fee
 *
 * A card-year runs from the last annual-fee date to the next; with no fee
 * date it is the calendar year. Each credit refills on its own cadence, and
 * usage is logged per period (card.creditLog[creditId][periodKey]).
 *
 * Rewards come from three places: subscriptions marked as paid with the card,
 * expenses logged against it, and the monthly spending estimate on the card.
 * Everything is in the card's own currency until the portfolio totals, which
 * are in USD like every other total.
 */

(function (ST) {
'use strict';

const D = ST.dates, M = ST.money, U = ST.util, L = ST.ledger;

const PER_YEAR = { monthly: 12, quarterly: 4, semiannual: 2, yearly: 1, cardyear: 1, once: 1 };

function def(card) { return CARD_BY_ID[card.cardId] || null; }

function credits(card) {
  const d = def(card);
  return (d ? d.credits : []).concat(card.customCredits || []);
}

function earnList(card) {
  const d = def(card);
  const base = d ? d.earn.slice() : [];
  (card.customEarn || []).forEach(function (e) {
    const i = base.findIndex(function (b) { return b.cat === e.cat; });
    if (i >= 0) base[i] = e; else base.push(e);
  });
  return base;
}

/* reward units per unit of spend in a category: exact, then its parent, then "other" */
function multiplier(card, cat) {
  const list = earnList(card);
  function find(c) { const e = list.filter(function (x) { return x.cat === c; })[0]; return e ? e.x : null; }
  const c = SPEND_CAT_BY_ID[cat];
  let x = find(cat);
  if (x == null && c && c.parent) x = find(c.parent);
  if (x == null) x = find('other');
  return x == null ? (list.length ? 0 : 1) : x;
}

/* fraction of spend returned, e.g. 0.048 for 4x at 1.2¢ */
function rewardRate(card, cat) { return multiplier(card, cat) * card.cpp / 100; }

function unitLabel(card) { const d = def(card); return d ? d.unit : 'points'; }

/* ── the card-year ── */

function shiftYear(s, n) {
  const d = D.parseYmd(s);
  D.addMonths(d, 12 * n, d.getDate());
  return D.ymd(d);
}

/* → { from, to, next } — next is the next fee date (null without one) */
function cardYear(card, today) {
  const t = today || D.todayStr();
  if (card.feeDate) {
    const next = D.nextOnOrAfter(card.feeDate, 'yearly', t);
    if (next === t) return { from: t, to: D.addDays(shiftYear(t, 1), -1), next: shiftYear(t, 1) };
    return { from: shiftYear(next, -1), to: D.addDays(next, -1), next: next };
  }
  const y = t.slice(0, 4);
  return { from: y + '-01-01', to: y + '-12-31', next: null };
}

/* ── credit periods ── */

function periodBounds(date, cadence, cy) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  function span(m0, len) {
    return { from: D.ymd(new Date(y, m0 - 1, 1)), to: D.ymd(new Date(y, m0 - 1 + len, 0)) };
  }
  if (cadence === 'monthly') return span(m, 1);
  if (cadence === 'quarterly') return span(Math.floor((m - 1) / 3) * 3 + 1, 3);
  if (cadence === 'semiannual') return span(m <= 6 ? 1 : 7, 6);
  if (cadence === 'yearly') return span(1, 12);
  if (cadence === 'cardyear') return { from: cy.from, to: cy.to };
  return { from: '0000-01-01', to: '9999-12-31' };   /* once */
}

function periodKey(date, cadence, cy) {
  const y = date.slice(0, 4), m = Number(date.slice(5, 7));
  if (cadence === 'monthly') return date.slice(0, 7);
  if (cadence === 'quarterly') return y + '-Q' + (Math.floor((m - 1) / 3) + 1);
  if (cadence === 'semiannual') return y + '-H' + (m <= 6 ? 1 : 2);
  if (cadence === 'yearly') return y;
  if (cadence === 'cardyear') return 'cy-' + cy.from;
  return 'once';
}

/* Calendar credits (a quarter, a calendar year) rarely line up with a card-year
   that starts on the fee date. A period belongs to the card-year its midpoint
   falls in, so each card-year counts exactly as many periods as the cadence
   promises — and the period running today is always this year's. */
function periodsInYear(cadence, cy) {
  if (cadence === 'cardyear' || cadence === 'once') return [{ key: periodKey(cy.from, cadence, cy), bounds: periodBounds(cy.from, cadence, cy) }];
  const out = [];
  let d = periodBounds(D.addDays(cy.from, -200), cadence, cy).from;
  let guard = 0;
  while (d <= cy.to && guard++ < 60) {
    const b = periodBounds(d, cadence, cy);
    const mid = D.addDays(b.from, Math.floor(D.daysBetween(b.from, b.to) / 2));
    if (mid >= cy.from && mid <= cy.to) out.push({ key: periodKey(d, cadence, cy), bounds: b });
    d = D.addDays(b.to, 1);
  }
  return out.slice(0, PER_YEAR[cadence]);
}

function logged(card, credit, key) {
  if (credit.auto) return credit.amount;
  const l = card.creditLog[credit.id];
  return l && l[key] ? l[key] : 0;
}

/* this period: { key, from, to, used, available, daysLeft } */
function creditNow(card, credit, today) {
  const t = today || D.todayStr();
  const cy = cardYear(card, t);
  const b = periodBounds(t, credit.cadence, cy);
  const key = periodKey(t, credit.cadence, cy);
  const used = credit.cadence === 'once' ? logged(card, credit, 'once') : logged(card, credit, key);
  return { key: key, from: b.from, to: b.to, used: used, available: Math.max(0, credit.amount - used),
           daysLeft: credit.cadence === 'once' ? null : D.daysBetween(t, b.to) };
}

/* ── the year's value ── */

function cardSpendSubs(st, card) {
  return L.activeSubs(st).filter(function (s) { return s.paidWith === card.id; });
}

function cardExpenses(st, card, from, to) {
  return st.expenses.filter(function (e) { return e.cardId === card.id && e.date >= from && e.date <= to; });
}

function toCard(amount, cur, card) { return M.fromUsd(M.toUsd(amount, cur), card.cur); }

function value(st, card, today) {
  const t = today || D.todayStr();
  const cy = cardYear(card, t);
  const yearDays = Math.max(1, D.daysBetween(cy.from, cy.to) + 1);
  const elapsed = Math.min(1, Math.max(0, (D.daysBetween(cy.from, t) + 1) / yearDays));

  let used = 0, potential = 0, remaining = 0;
  const list = credits(card).map(function (c) {
    const periods = periodsInYear(c.cadence, cy);
    let cUsed = 0, cRemaining = 0;
    periods.forEach(function (p) {
      const u = Math.min(c.amount, logged(card, c, p.key));
      cUsed += u;
      if (p.bounds.to >= t) cRemaining += Math.max(0, c.amount - u);
    });
    const cPotential = c.amount * periods.length;
    used += cUsed; potential += cPotential; remaining += cRemaining;
    return { credit: c, used: cUsed, potential: cPotential, remaining: cRemaining, now: creditNow(card, c, t) };
  });

  /* rewards: subscriptions paid with it, expenses on it, and the estimate */
  let subMonthly = 0;
  cardSpendSubs(st, card).forEach(function (s) {
    subMonthly += toCard(L.monthlyUsd(s) * L.share(s), 'USD', card) * rewardRate(card, L.subSpendCat(s));
  });
  let estMonthly = 0;
  Object.keys(card.spend).forEach(function (cat) { estMonthly += card.spend[cat] * rewardRate(card, cat); });
  const exps = cardExpenses(st, card, cy.from, t);
  const expEarned = U.sum(exps, function (e) { return toCard(e.amount, e.cur, card) * rewardRate(card, e.cat); });

  const rewardsEarned = (subMonthly + estMonthly) * 12 * elapsed + expEarned;
  const rewardsProjected = (subMonthly + estMonthly) * 12 + (elapsed > 0.05 ? expEarned / elapsed : expEarned);

  const perks = U.sum(Object.keys(card.perks), function (k) { return card.perks[k]; });
  const fee = card.fee;

  return {
    card: card, cy: cy, elapsed: elapsed, credits: list,
    creditsUsed: used, creditsPotential: potential, creditsRemaining: remaining,
    rewardsEarned: rewardsEarned, rewardsProjected: rewardsProjected, perks: perks, fee: fee,
    getting: used + rewardsEarned + perks - fee,
    could: potential + rewardsProjected + perks - fee,
    /* how much more credit use it takes for the year to pay for itself */
    breakEven: Math.max(0, fee - (used + rewardsProjected + perks))
  };
}

function portfolio(st, today) {
  const vals = st.cards.filter(function (c) { return c.active; }).map(function (c) { return value(st, c, today); });
  function usd(v, k) { return M.toUsd(v[k], v.card.cur); }
  return {
    cards: vals,
    netUsd: U.sum(vals, function (v) { return usd(v, 'getting'); }),
    potentialUsd: U.sum(vals, function (v) { return usd(v, 'could'); }),
    unclaimedUsd: U.sum(vals, function (v) { return usd(v, 'creditsRemaining'); }),
    feesUsd: U.sum(vals, function (v) { return usd(v, 'fee'); })
  };
}

/* ── sign-up bonus ── */

function bonus(st, card, today) {
  const d = def(card);
  if (!card.bonus || card.bonus.done || !d || !d.bonus || !d.bonus.spend) return null;
  const t = today || D.todayStr();
  const from = card.openedAt || '0000-01-01';
  const to = card.bonus.deadline || '9999-12-31';
  const onCard = U.sum(cardExpenses(st, card, from, to), function (e) { return toCard(e.amount, e.cur, card); });
  const spent = Math.max(card.bonus.spent, onCard);
  const b = d.bonus;
  return {
    required: b.spend, spent: spent, left: Math.max(0, b.spend - spent), met: spent >= b.spend,
    deadline: card.bonus.deadline, daysLeft: card.bonus.deadline ? D.daysBetween(t, card.bonus.deadline) : null,
    amount: b.amount, cash: !!b.cash,
    worth: b.cash ? b.amount : b.amount * card.cpp / 100
  };
}

/* ── links to subscriptions ── */

/* a held card whose credit pays for this subscription → { card, credit, yearUsd } */
function coverFor(st, sub) {
  if (!sub.serviceId) return null;
  let best = null;
  st.cards.filter(function (c) { return c.active; }).forEach(function (c) {
    credits(c).forEach(function (cr) {
      if (cr.covers.indexOf(sub.serviceId) === -1) return;
      const yearUsd = Math.min(M.toUsd(cr.amount * PER_YEAR[cr.cadence], c.cur), L.monthlyUsd(sub) * 12);
      if (!best || yearUsd > best.yearUsd) best = { card: c, credit: cr, yearUsd: yearUsd };
    });
  });
  return best;
}

/* the held card that returns most on a spending category */
function bestCardFor(st, cat) {
  let best = null;
  st.cards.filter(function (c) { return c.active; }).forEach(function (c) {
    const r = rewardRate(c, cat);
    if (!best || r > best.rate) best = { card: c, rate: r, x: multiplier(c, cat), label: (SPEND_CAT_BY_ID[cat] || {}).name || cat };
  });
  return best && best.rate > 0 ? best : null;
}

/* ── calendar and alerts ── */

function events(st, from, to) {
  const t = D.todayStr();
  const out = [];
  st.cards.filter(function (c) { return c.active; }).forEach(function (c) {
    if (c.feeDate && c.fee > 0) {
      D.occurrences(c.feeDate, 'yearly', from, to).forEach(function (d) {
        out.push({ date: d, kind: 'fee', title: c.name + ' annual fee', detail: c.issuer,
                   usd: M.toUsd(c.fee, c.cur), color: c.color, ref: { type: 'card', id: c.id } });
      });
    }
    /* credits running out this period, one entry per card per day */
    const byDay = {};
    credits(c).forEach(function (cr) {
      if (cr.auto || cr.cadence === 'once') return;
      const now = creditNow(c, cr, t);
      if (now.available <= 0 || now.to < from || now.to > to) return;
      (byDay[now.to] = byDay[now.to] || []).push({ name: cr.name, amount: now.available });
    });
    Object.keys(byDay).forEach(function (d) {
      const list = byDay[d];
      out.push({ date: d, kind: 'credit', title: c.name + ' credits', detail: list.map(function (x) { return x.name; }).join(', '),
                 usd: M.toUsd(U.sum(list, function (x) { return x.amount; }), c.cur), color: c.color, ref: { type: 'card', id: c.id } });
    });
    const b = bonus(st, c, t);
    if (b && !b.met && b.deadline && b.deadline >= from && b.deadline <= to) {
      out.push({ date: b.deadline, kind: 'credit', title: c.name + ' bonus deadline',
                 detail: M.fmtMoney(b.left, c.cur) + ' more to spend', usd: M.toUsd(b.worth, c.cur), color: c.color, ref: { type: 'card', id: c.id } });
    }
  });
  return out;
}

const WARN_DAYS = { monthly: 5, quarterly: 14, semiannual: 21, yearly: 30, cardyear: 30 };

function alerts(st) {
  const t = D.todayStr();
  const out = [];
  st.cards.filter(function (c) { return c.active; }).forEach(function (c) {
    credits(c).forEach(function (cr) {
      if (cr.auto || cr.cadence === 'once') return;
      const now = creditNow(c, cr, t);
      if (now.available <= 0 || now.daysLeft > WARN_DAYS[cr.cadence]) return;
      out.push({ id: 'credit:' + c.id + ':' + cr.id + ':' + now.key, priority: 2, tone: 'warn', date: now.to,
        title: 'Use your ' + M.fmtMoney(now.available, c.cur) + ' ' + cr.name + ' credit — ' +
               (now.daysLeft === 0 ? 'last day today' : 'expires ' + D.relDay(now.daysLeft)),
        body: c.name + ' · resets ' + D.fmtDate(D.addDays(now.to, 1), { day: 'numeric', month: 'short' }) + '.',
        action: { type: 'card', id: c.id } });
    });
    const b = bonus(st, c, t);
    if (b && !b.met && b.daysLeft != null && b.daysLeft >= 0 && b.daysLeft <= 30) {
      out.push({ id: 'bonus:' + c.id, priority: 2, tone: 'warn', date: b.deadline,
        title: 'Spend ' + M.fmtMoney(b.left, c.cur) + ' more on ' + c.name + ' by ' + D.fmtDate(b.deadline, { day: 'numeric', month: 'short' }),
        body: 'That unlocks ' + (b.cash ? M.fmtMoney(b.amount, c.cur) : b.amount.toLocaleString('en-US') + ' ' + unitLabel(c)) +
              ', worth about ' + M.fmtMoney(b.worth, c.cur, { dec: 0 }) + '.',
        action: { type: 'card', id: c.id } });
    }
    if (c.feeDate && c.fee > 0) {
      const next = D.nextOnOrAfter(c.feeDate, 'yearly', t);
      const days = D.daysBetween(t, next);
      if (days <= 30) {
        const v = value(st, c, t);
        out.push({ id: 'fee:' + c.id + ':' + next, priority: 3, tone: v.getting >= 0 ? 'info' : 'warn', date: next,
          title: c.name + '’s ' + M.fmtMoney(c.fee, c.cur, { dec: 0 }) + ' fee is due ' + D.relDay(days),
          body: 'This card-year it returned ' + M.fmtMoney(v.creditsUsed + v.rewardsEarned + v.perks, c.cur, { dec: 0 }) +
                (v.getting >= 0 ? ' — more than the fee.' : ' — less than the fee. Worth keeping?'),
          action: { type: 'card', id: c.id } });
      }
    }
  });
  return out;
}

ST.cardvalue = { PER_YEAR: PER_YEAR, def: def, credits: credits, earnList: earnList, multiplier: multiplier,
                 rewardRate: rewardRate, unitLabel: unitLabel, cardYear: cardYear, periodKey: periodKey,
                 periodBounds: periodBounds, periodsInYear: periodsInYear, creditNow: creditNow,
                 value: value, portfolio: portfolio, bonus: bonus, coverFor: coverFor, bestCardFor: bestCardFor,
                 events: events, alerts: alerts };

})(window.ST = window.ST || {});
