/* aidata.js — what Gemini is shown, and what it is asked.
 *
 * This is the only place that decides what leaves the browser for an AI
 * answer, so it is kept small and plain: totals, subscription names and
 * prices, card names and values, budgets. Never ids, notes, tags, shop names
 * from expenses, exact dates or anything about the account. Statement
 * categorising is the one exception, and sends shop names only (see merchants).
 * Everything is in the display currency, rounded.
 */

(function (ST) {
'use strict';

const L = ST.ledger, D = ST.dates, M = ST.money;

function round(v) { return Math.round(v * 100) / 100; }

/* the state, summarised; month is 'YYYY-MM' (this month by default) */
function summary(st, month) {
  const cur = st.settings.currency;
  const inCur = function (usd) { return round(M.fromUsd(usd, cur)); };
  const key = month || D.monthKey(D.todayStr());
  const prev = D.shiftMonth(key, -1);
  const catName = function (id) { return (SPEND_CAT_BY_ID[id] || SPEND_CAT_BY_ID.other).name; };
  const byCat = function (k, expensesOnly) {
    const t = L.categoryTotals(st, k, { expensesOnly: expensesOnly });
    const out = {};
    Object.keys(t).sort(function (a, b) { return t[b] - t[a]; }).forEach(function (c) { if (t[c] > 0.005) out[catName(c)] = inCur(t[c]); });
    return out;
  };
  const subs = L.activeSubs(st).map(function (s) {
    const o = { name: s.name, perMonth: inCur(L.monthlyUsd(s)), billed: s.cycle || 'monthly' };
    if (s.tierName) o.plan = s.tierName;
    const g = s.group && GROUP_BY_ID[s.group];
    if (g) o.category = g.name;
    if (s.shareCount > 1) o.splitWays = s.shareCount;
    if (s.trialEnds && D.daysUntil(s.trialEnds) >= 0) o.freeTrialEndsInDays = D.daysUntil(s.trialEnds);
    if (s.uses && s.uses[key] != null) o.usesThisMonth = s.uses[key];
    return o;
  });
  const cards = ST.cardvalue ? ST.cardvalue.portfolio(st).cards.map(function (v) {
    const c = v.card, toCur = function (x) { return inCur(M.toUsd(x, c.cur)); };
    return { name: c.name, issuer: c.issuer || '', annualFee: toCur(v.fee), creditsUsedThisCardYear: toCur(v.creditsUsed),
             creditsAvailablePerYear: toCur(v.creditsPotential), rewardsSoFar: toCur(v.rewardsEarned),
             rewardsExpectedPerYear: toCur(v.rewardsProjected), perksValuedAt: toCur(v.perks),
             valueNow: toCur(v.getting), valueIfEverythingUsed: toCur(v.could) };
  }) : [];
  const budgets = ST.budgets ? ST.budgets.status(st, key).map(function (b) {
    return { category: b.cat.name, limit: inCur(b.limitUsd), spent: inCur(b.spentUsd) };
  }) : [];
  return {
    currency: cur, month: key,
    subscriptions: subs,
    subscriptionsPerMonth: inCur(L.subsMonthlyUsd(st)),
    spendingThisMonth: byCat(key, true), spendingLastMonth: byCat(prev, true),
    totalOutThisMonth: inCur(L.subsMonthlyUsd(st) + L.monthSpendUsd(st, key)),
    cards: cards, budgets: budgets
  };
}

/* distinct shop names from statement lines no rule could place */
function merchants(expenses) {
  const seen = {};
  return expenses.filter(function (e) { return e.cat === 'other' && !e.subId; })
    .map(function (e) { return e.merchant; })
    .filter(function (m) { const k = m.toUpperCase(); if (!m || seen[k]) return false; seen[k] = true; return true; })
    .slice(0, 60);
}

const STYLE = 'Write plain text for one person reading on their phone: short paragraphs or lines starting with "- ", no headings, no tables, no Markdown other than **bold** for a key figure. ' +
  'Use only the figures given; never invent prices, offers or numbers. Money is in the currency given. ' +
  'You are not a financial adviser: no investment, tax or credit-score advice.';

function reviewPrompt(sum) {
  return 'You are a calm, practical money assistant inside Subtrackr, a subscription and spending tracker. ' +
    'Here is the person’s month as JSON:\n' + JSON.stringify(sum) + '\n\n' +
    'Write a review of ' + sum.month + ' in at most 170 words: where the money went, what changed against last month (only if last month has figures), ' +
    'anything over budget, and two or three specific, doable things to look at next, each with the amount it would save where that can be worked out from the data. ' + STYLE;
}

function askPrompt(sum, question) {
  return 'You are a calm, practical money assistant inside Subtrackr, a subscription and spending tracker. ' +
    'Here is the person’s data as JSON:\n' + JSON.stringify(sum) + '\n\n' +
    'Their question: """' + String(question).slice(0, 600) + '"""\n\n' +
    'Answer in at most 150 words, from this data. If the data cannot answer it, say what is missing. ' + STYLE;
}

function cardsPrompt(sum) {
  return 'You are a practical credit card value assistant inside Subtrackr. The person’s cards and how they use them, as JSON:\n' +
    JSON.stringify({ currency: sum.currency, cards: sum.cards, subscriptions: sum.subscriptions, spendingThisMonth: sum.spendingThisMonth }) + '\n\n' +
    'For each card, in at most 60 words each: is the annual fee earning its keep at this usage (compare valueNow and valueIfEverythingUsed with annualFee), ' +
    'what would most improve it before the next renewal, and a plain verdict — keep, keep if…, or consider downgrading/cancelling. ' +
    'Do not recommend other specific cards or products. ' + STYLE;
}

function categorisePrompt(names) {
  const cats = SPEND_CATS.filter(function (c) { return c.id !== 'other'; }).map(function (c) { return c.id + ' (' + c.name + ')'; });
  return 'Sort these bank statement descriptions into spending categories. Categories (id and name): ' + cats.join(', ') + '.\n' +
    'Descriptions:\n' + names.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n') + '\n\n' +
    'Reply with JSON only: {"categories":{"<description exactly as given>":"<category id>"}}. ' +
    'Leave out any description you are not reasonably sure about.';
}

/* the answer, escaped, with paragraphs, "- " lists and **bold** */
function renderAnswer(text) {
  const esc = ST.util.esc;
  const blocks = String(text || '').trim().split(/\n{2,}/);
  return blocks.map(function (b) {
    const lines = b.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    const bold = function (s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); };
    if (lines.length && lines.every(function (l) { return /^[-*•]\s+/.test(l); })) {
      return '<ul>' + lines.map(function (l) { return '<li>' + bold(l.replace(/^[-*•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
    }
    return '<p>' + lines.map(bold).join('<br>') + '</p>';
  }).join('');
}

ST.aidata = { summary: summary, merchants: merchants, reviewPrompt: reviewPrompt, askPrompt: askPrompt,
              cardsPrompt: cardsPrompt, categorisePrompt: categorisePrompt, renderAnswer: renderAnswer };

})(window.ST = window.ST || {});
