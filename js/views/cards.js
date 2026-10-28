/* views/cards.js — the Cards tab: what each card pays you back against its
 * fee, this period's credits to tick off, the sign-up bonus, and a browsable
 * list of cards for the US, UK and India.
 */

(function (ST) {
'use strict';

const U = ST.util, M = ST.money, D = ST.dates, L = ST.ledger, V = ST.cardvalue, UI = ST.ui;
const $ = UI.$, $$ = UI.$$, esc = U.esc;

function st() { return ST.app.state; }
function findCard(id) { return st().cards.filter(function (c) { return c.id === id; })[0]; }

let browseMarket = null;
let focusId = null;

function money(v, card, opts) { return M.fmtMoney(v, card.cur, opts); }

/* a card's figures in its own currency, with the display currency alongside when they differ */
function both(v, card, opts) {
  const own = money(v, card, opts);
  if (card.cur === UI.settings().currency) return own;
  return own + ' <span class="muted">(' + UI.amt(v, card.cur, opts) + ')</span>';
}

const SHORT = { 'American Express': 'Amex', 'Capital One': 'Cap One', 'Wells Fargo': 'Wells', 'Goldman Sachs': 'Apple',
                'Barclaycard': 'Barclays', 'HDFC Bank': 'HDFC', 'Axis Bank': 'Axis', 'ICICI Bank': 'ICICI', 'SBI Card': 'SBI' };
function short(issuer) { return SHORT[issuer] || String(issuer || '').split(' ')[0]; }

/* the card in its colour, with the issuer's logo on a white badge when one is bundled */
function chip(color, label, issuer) {
  const src = UI.logoSrc(issuer);
  return '<span class="cc-chip" aria-hidden="true" style="background:' + U.safeColor(color) + '">' +
    (src ? '<span class="cc-badge"><img src="' + esc(src) + '" alt="" loading="lazy" decoding="async"></span>' : esc(label || '')) + '</span>';
}

const CADENCE_LABEL = { monthly: 'a month', quarterly: 'a quarter', semiannual: 'every 6 months', yearly: 'a calendar year', cardyear: 'a card-year', once: 'once' };

function periodName(now, cadence) {
  if (cadence === 'monthly') return D.fmtDate(now.from, { month: 'long' });
  if (cadence === 'quarterly') return now.key.slice(5) + ' ' + now.key.slice(0, 4);
  if (cadence === 'semiannual') return D.fmtDate(now.from, { month: 'short' }) + '–' + D.fmtDate(now.to, { month: 'short' });
  if (cadence === 'yearly') return now.key;
  if (cadence === 'cardyear') return 'this card-year';
  return 'one-time';
}

/* ─────────────────────────────  your cards  ───────────────────────────── */

function renderYours() {
  const s = st();
  const pf = V.portfolio(s);
  const cards = s.cards.slice().sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0); });

  if (!cards.length) {
    return '<section class="card">' + UI.empty('No cards yet. Pick yours from the list and see what it pays you back against its fee.',
      '<a class="btn btn-primary" href="#/cards/browse">Browse cards</a>') + '</section>';
  }

  const stats = '<div class="stats">' +
    UI.stat('Getting now', UI.usd(pf.netUsd, { sign: true, dec: 0 }), 'Credits used + rewards so far − fees', pf.netUsd >= 0 ? 'good' : 'bad') +
    UI.stat('Could get', UI.usd(pf.potentialUsd, { sign: true, dec: 0 }), 'If every credit is used this year', pf.potentialUsd >= 0 ? 'good' : 'bad') +
    UI.stat('Still unclaimed', UI.usd(pf.unclaimedUsd, { dec: 0 }), 'Credits left in this card-year') +
    UI.stat('Annual fees', UI.usd(pf.feesUsd, { dec: 0 }), U.plural(pf.cards.length, 'active card')) +
    '</div>';

  return stats + cards.map(function (c) { return cardBox(c); }).join('');
}

function cardBox(c) {
  const s = st();
  const v = V.value(s, c);
  const d = V.def(c);
  const got = v.creditsUsed + v.rewardsEarned + v.perks;
  const total = Math.max(v.creditsPotential + v.rewardsProjected + v.perks, c.fee, 1);
  const feeAt = Math.min(1, c.fee / total) * 100;
  const next = v.cy.next;

  /* subscriptions its credits pay for */
  const covered = s.subs.filter(function (sub) {
    const cov = sub.active && V.coverFor(s, sub);
    return cov && cov.card.id === c.id;
  });
  /* where it is the best card you hold */
  const bestFor = SPEND_CATS.filter(function (cat) { return !cat.parent || cat.id === 'streaming'; }).filter(function (cat) {
    const b = V.bestCardFor(s, cat.id);
    return b && b.card.id === c.id && V.multiplier(c, cat.id) > 1;
  });
  const b = V.bonus(s, c);

  const credits = v.credits.filter(function (x) { return !x.credit.auto; });
  /* what needs attention first: unused this period and lapsing within a month */
  function urgent(x) { return x.now.available > 0 && (x.credit.cadence === 'monthly' || (x.now.daysLeft != null && x.now.daysLeft <= 31)); }
  const ordered = credits.slice().sort(function (a, b) {
    return (urgent(b) ? 1 : 0) - (urgent(a) ? 1 : 0) || (a.now.daysLeft == null ? 1e9 : a.now.daysLeft) - (b.now.daysLeft == null ? 1e9 : b.now.daysLeft);
  });
  const shown = ordered.filter(urgent);
  const folded = ordered.filter(function (x) { return !urgent(x); });
  function rows(list) { return list.map(creditRow).join(''); }
  function creditRow(x) {
    const cr = x.credit, now = x.now;
    const done = now.available <= 0;
    const lapse = now.daysLeft != null && !done ? (now.daysLeft === 0 ? 'last day' : now.daysLeft + ' days left') : '';
    return '<li class="credit-row' + (done ? ' done' : '') + '">' +
      '<span class="credit-main"><span class="credit-name">' + esc(cr.name) + '</span>' +
      '<span class="credit-sub">' + money(cr.amount, c) + ' ' + esc(CADENCE_LABEL[cr.cadence]) + ' · ' + esc(periodName(now, cr.cadence)) +
        (cr.note ? ' · ' + esc(cr.note) : '') + '</span></span>' +
      '<span class="credit-state">' + (done ? '<span class="tag tag-good">Used</span>'
        : '<span class="num">' + money(now.available, c) + '</span> <span class="muted">' + esc(lapse) + '</span>') + '</span>' +
      '<button class="btn btn-sm' + (done ? '' : ' btn-primary') + '" type="button" data-log="' + esc(cr.id) + '">' + (done ? 'Edit' : 'Log use') + '</button></li>';
  }

  const auto = v.credits.filter(function (x) { return x.credit.auto; });

  return '<section class="card cardbox' + (c.active ? '' : ' paused') + (focusId === c.id ? ' focus' : '') + '" id="card-' + esc(c.id) + '" data-card="' + esc(c.id) + '">' +
    '<div class="cardbox-head">' + chip(c.color, short(c.issuer), c.issuer) +
      '<div class="cardbox-title"><h2>' + esc(c.name) + (c.active ? '' : ' <span class="tag">Closed</span>') + '</h2>' +
        '<span class="muted">' + esc(c.issuer) + ' · ' + (c.fee ? money(c.fee, c, { dec: 0 }) + ' a year' : 'no annual fee') +
        (next ? ' · renews ' + esc(D.fmtDate(next, { day: 'numeric', month: 'short', year: 'numeric' })) : ' · no fee date set') + '</span></div>' +
      '<div class="cardbox-net"><span class="fig ' + (v.getting >= 0 ? 'good' : 'bad') + '">' + money(v.getting, c, { sign: true, dec: 0 }) + '</span>' +
        '<span class="muted">getting now · could get ' + money(v.could, c, { sign: true, dec: 0 }) + '</span></div>' +
    '</div>' +
    '<div class="vbar" role="img" aria-label="' + esc('Returned ' + money(got, c, { dec: 0 }) + ' of a possible ' + money(total, c, { dec: 0 }) + '; the fee is ' + money(c.fee, c, { dec: 0 })) + '">' +
      '<span class="vbar-fill" style="width:' + Math.min(100, got / total * 100).toFixed(1) + '%"></span>' +
      (c.fee ? '<span class="vbar-fee" style="left:' + feeAt.toFixed(1) + '%" title="Annual fee"></span>' : '') +
    '</div>' +
    '<div class="vbar-legend"><span>Credits ' + money(v.creditsUsed, c, { dec: 0 }) + ' of ' + money(v.creditsPotential, c, { dec: 0 }) + '</span>' +
      '<span>Rewards ' + money(v.rewardsEarned, c, { dec: 0 }) + ' so far · ~' + money(v.rewardsProjected, c, { dec: 0 }) + ' a year</span>' +
      (v.perks ? '<span>Perks ' + money(v.perks, c, { dec: 0 }) + '</span>' : '') +
      (c.fee ? '<span>Fee line ' + money(c.fee, c, { dec: 0 }) + '</span>' : '') + '</div>' +
    (v.breakEven > 0 && c.fee ? '<p class="note-warn">Use ' + money(v.breakEven, c, { dec: 0 }) + ' more in credits this card-year for it to pay for its fee.</p>' : '') +
    (!Object.keys(c.spend).length && !L.activeSubs(s).some(function (x) { return x.paidWith === c.id; }) && !s.expenses.some(function (e) { return e.cardId === c.id; })
      ? '<p class="muted">Rewards are counted from subscriptions paid with this card, expenses logged on it, or a monthly spending estimate — <button class="link-btn" type="button" data-edit>add an estimate</button>.</p>' : '') +
    (credits.length ? '<h3 class="cardbox-sub">Credits this period</h3>' +
      (shown.length ? '<ul class="credit-list">' + rows(shown) + '</ul>' : '<p class="muted" style="margin:0">Nothing lapsing in the next month.</p>') +
      (folded.length ? '<details class="cardbox-more"><summary>Show ' + U.plural(folded.length, 'more credit') + '</summary>' +
        '<ul class="credit-list">' + rows(folded) + '</ul></details>' : '') : '') +
    (auto.length ? '<p class="muted">Applied automatically: ' + auto.map(function (x) { return esc(x.credit.name) + ' (' + money(x.credit.amount, c, { dec: 0 }) + ')'; }).join(', ') + '.</p>' : '') +
    (b ? '<div class="bonus"><div class="bar-top"><span><strong>Sign-up bonus</strong> · ' +
        (b.cash ? money(b.amount, c, { dec: 0 }) : b.amount.toLocaleString('en-US') + ' ' + esc(V.unitLabel(c))) +
        ' (≈' + money(b.worth, c, { dec: 0 }) + ')</span><span class="num">' + money(b.spent, c, { dec: 0 }) + ' / ' + money(b.required, c, { dec: 0 }) + '</span></div>' +
        UI.bar(b.spent / b.required, 'thin') +
        '<span class="bar-note' + (!b.met && b.daysLeft != null && b.daysLeft <= 30 ? ' bad' : '') + '">' +
        (b.met ? 'Spend met — the bonus should post with your next statement.' :
          money(b.left, c, { dec: 0 }) + ' to go' + (b.deadline ? ' by ' + esc(D.fmtDate(b.deadline)) + ' (' + D.relDay(b.daysLeft) + ')' : '')) + '</span></div>' : '') +
    (covered.length ? '<p class="cardbox-line"><strong>Pays for:</strong> ' + covered.map(function (sub) {
        const cov = V.coverFor(s, sub);
        return esc(sub.name) + ' <span class="muted">(' + UI.usd(cov.yearUsd, { dec: 0 }) + ' a year)</span>';
      }).join(', ') + '</p>' : '') +
    (bestFor.length ? '<p class="cardbox-line"><strong>Your best card for:</strong> ' + bestFor.map(function (cat) {
        return esc(cat.name) + ' <span class="muted">(' + V.multiplier(c, cat.id) + (d && d.kind === 'cashback' ? '%' : 'x') + ')</span>';
      }).join(', ') + '</p>' : '') +
    (d && d.earnNotes.length ? '<details class="cardbox-more"><summary>Earning details</summary><ul class="benefits">' +
        d.earnNotes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></details>' : '') +
    '<div class="sub-actions">' +
      '<button class="btn btn-sm" type="button" data-edit>Edit</button>' +
      '<button class="btn btn-sm" type="button" data-toggle>' + (c.active ? 'Mark closed' : 'Reopen') + '</button>' +
      '<button class="btn btn-sm btn-danger" type="button" data-remove>Remove</button>' +
    '</div></section>';
}

/* ─────────────────────────────  browse  ───────────────────────────── */

function earnSummary(d) {
  const pct = d.kind === 'cashback';
  return d.earn.slice().sort(function (a, b) { return b.x - a.x; }).map(function (e) {
    const name = e.cat === 'other' ? 'everything else' : (SPEND_CAT_BY_ID[e.cat] || {}).name || e.cat;
    const x = pct ? e.x + '%' : (e.x < 1 ? (e.x * 100).toFixed(e.x * 100 % 1 ? 1 : 0) + ' per 100' : e.x + 'x');
    return x + ' ' + name.toLowerCase();
  }).join(' · ');
}

function creditsYear(d) {
  return U.sum(d.credits.filter(function (c) { return c.cadence !== 'once'; }), function (c) { return c.amount * V.PER_YEAR[c.cadence]; });
}

function renderBrowse() {
  const m = browseMarket || (CARD_MARKETS.indexOf(UI.settings().region) >= 0 ? UI.settings().region : 'US');
  browseMarket = m;
  const list = CARDS.filter(function (d) { return d.market === m; })
    .sort(function (a, b) { return b.fee - a.fee || a.name.localeCompare(b.name); });
  const held = {};
  st().cards.forEach(function (c) { if (c.cardId) held[c.cardId] = true; });

  return '<div class="chips" role="group" aria-label="Market" style="margin-bottom:16px">' + CARD_MARKETS.map(function (code) {
      const r = REGION_BY_CODE[code];
      return '<button class="chip" type="button" data-market="' + code + '" aria-pressed="' + (code === m) + '">' + r.flag + ' ' + esc(r.name) + '</button>';
    }).join('') + '</div>' +
    '<p class="muted" style="margin-bottom:14px">Terms as published in October 2026 — issuers change them often, so check before you apply. ' +
    'Welcome offers vary by applicant.</p>' +
    '<div class="sub-list">' + list.map(function (d) {
      const yr = creditsYear(d);
      return '<article class="svc-card">' +
        '<div class="svc-top">' + chip(d.color, short(d.issuer), d.issuer) +
          '<div><div class="svc-name">' + esc(d.name) + (held[d.id] ? ' <span class="tag tag-good">Yours</span>' : '') +
            (d.closed ? ' <span class="tag">Closed to new applicants</span>' : '') + '</div>' +
          '<div class="svc-company">' + esc(d.issuer) + ' · ' + (d.fee ? M.fmtMoney(d.fee, d.cur, { dec: 0 }) + ' a year' + (d.firstYearFree ? ', first year free' : '') : 'no annual fee') + '</div></div>' +
        '</div>' +
        '<p class="svc-blurb">' + esc(d.blurb) + '</p>' +
        '<div class="svc-from">' + esc(earnSummary(d)) + '</div>' +
        (yr ? '<div class="svc-from">Credits worth up to <strong>' + M.fmtMoney(yr, d.cur, { dec: 0 }) + '</strong> a year</div>' : '') +
        '<div class="svc-actions">' +
          '<button class="btn btn-sm btn-primary" type="button" data-add-card="' + esc(d.id) + '">Add</button>' +
          '<button class="btn btn-sm" type="button" data-card-detail="' + esc(d.id) + '">Details</button>' +
        '</div></article>';
    }).join('') + '</div>';
}

function openDetail(id) {
  const d = CARD_BY_ID[id];
  if (!d) return;
  UI.openModal(d.issuer + ' ' + d.name,
    '<p class="sub" style="margin-bottom:12px">' + esc(d.blurb) + '</p>' +
    '<dl class="kv"><dt>Annual fee</dt><dd>' + (d.fee ? M.fmtMoney(d.fee, d.cur, { dec: 0 }) + (d.firstYearFree ? ', first year free' : '') : 'None') + '</dd>' +
    '<dt>Rewards</dt><dd>' + esc(d.unit) + (d.kind === 'cashback' ? '' : ', valued at ' + d.cpp + (d.cur === 'INR' ? ' paise' : d.cur === 'GBP' ? 'p' : '¢') + ' each (editable)') + '</dd>' +
    '<dt>Earning</dt><dd>' + esc(earnSummary(d)) + '</dd>' +
    (d.bonus ? '<dt>Welcome offer</dt><dd>' + (d.bonus.cash ? M.fmtMoney(d.bonus.amount, d.cur, { dec: 0 }) : d.bonus.amount.toLocaleString('en-US') + ' ' + esc(d.unit)) +
      (d.bonus.spend ? ' after ' + M.fmtMoney(d.bonus.spend, d.cur, { dec: 0 }) + ' in ' + d.bonus.months + ' months' : '') + (d.bonus.note ? ' — ' + esc(d.bonus.note) : '') + '</dd>' : '') +
    '</dl>' +
    (d.earnNotes.length ? '<h3 style="margin:16px 0 6px">Also</h3><ul class="benefits">' + d.earnNotes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
    (d.credits.length ? '<h3 style="margin:16px 0 6px">Credits</h3><div class="table-wrap"><table><thead><tr><th>Credit</th><th class="num">Amount</th><th>How often</th><th class="num">A year</th></tr></thead><tbody>' +
      d.credits.map(function (c) {
        return '<tr><td>' + esc(c.name) + (c.covers.length ? ' <span class="muted">· pays for ' + c.covers.map(function (sid) { return SERVICE_BY_ID[sid] ? esc(SERVICE_BY_ID[sid].name) : ''; }).filter(Boolean).join(', ') + '</span>' : '') +
          '</td><td class="num">' + M.fmtMoney(c.amount, d.cur) + '</td><td>' + esc(CADENCE_LABEL[c.cadence]) + '</td><td class="num">' +
          M.fmtMoney(c.amount * V.PER_YEAR[c.cadence], d.cur, { dec: 0 }) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '') +
    (d.perks.length ? '<h3 style="margin:16px 0 6px">Perks</h3><ul class="benefits">' + d.perks.map(function (p) { return '<li>' + esc(p.name) + '</li>'; }).join('') + '</ul>' : '') +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Close</button>' +
    '<button class="btn btn-primary" type="button" data-add-card="' + esc(d.id) + '">Add this card</button></div>', { wide: true });
}

/* ─────────────────────────────  add / edit  ───────────────────────────── */

function openForm(card, catalogId) {
  const editing = !!card;
  const d = catalogId ? CARD_BY_ID[catalogId] : (card ? V.def(card) : null);
  const draft = editing ? JSON.parse(JSON.stringify(card))
    : ST.store.cleanCard({ cardId: d ? d.id : '', cur: d ? d.cur : UI.region().cur });
  if (!editing && !d) draft.name = '';

  const cur = draft.cur;
  const spendCats = (function () {
    const ids = d ? d.earn.map(function (e) { return e.cat; }) : draft.customEarn.map(function (e) { return e.cat; });
    ['dining', 'groceries', 'other'].forEach(function (x) { if (ids.indexOf(x) === -1) ids.push(x); });
    Object.keys(draft.spend).forEach(function (x) { if (ids.indexOf(x) === -1) ids.push(x); });
    return ids;
  })();

  const perks = d ? d.perks : [];
  const bonusOffer = d && d.bonus && d.bonus.spend ? d.bonus : null;
  const defaultDeadline = draft.openedAt && bonusOffer ? D.addDays(addMonthsStr(draft.openedAt, bonusOffer.months), -1) : '';

  const body = '<form id="cardForm" novalidate>' +
    (d ? '<p class="sub" style="margin-bottom:14px">' + chip(d.color, short(d.issuer), d.issuer) + ' ' + esc(d.issuer) + ' · ' + esc(earnSummary(d)) + '</p>' : '') +
    '<div class="field-row">' +
      '<div class="field"><label for="cName">Name</label><input id="cName" type="text" required value="' + esc(draft.name) + '" placeholder="' + (d ? esc(d.name) : 'e.g. My travel card') + '"></div>' +
      '<div class="field"><label for="cIssuer">Issuer</label><input id="cIssuer" type="text" value="' + esc(draft.issuer) + '"></div>' +
    '</div>' +
    '<div class="field-row three">' +
      '<div class="field"><label for="cFee">Annual fee</label><input id="cFee" type="number" min="0" step="1" inputmode="decimal" value="' + esc(draft.fee) + '"></div>' +
      '<div class="field"><label for="cCur">Currency</label><select id="cCur">' + UI.currencyOptions(cur) + '</select></div>' +
      '<div class="field"><label for="cFeeDate">Next fee date</label><input id="cFeeDate" type="date" value="' + esc(draft.feeDate) + '">' +
        '<span class="field-hint">Sets the card-year credits reset on.</span></div>' +
    '</div>' +
    '<div class="field-row three">' +
      '<div class="field"><label for="cOpened">Opened</label><input id="cOpened" type="date" value="' + esc(draft.openedAt) + '"></div>' +
      '<div class="field"><label for="cCpp">Value of one ' + esc(d ? (d.kind === 'cashback' ? '% of cash back' : 'point') : 'point') + '</label>' +
        '<input id="cCpp" type="number" min="0" max="100" step="0.05" value="' + esc(draft.cpp) + '"' + (d && d.kind === 'cashback' ? ' disabled' : '') + '>' +
        '<span class="field-hint">In hundredths of the currency (cents, pence, paise).</span></div>' +
      '<div class="field"><label for="cColor">Colour</label><input id="cColor" type="color" value="' + esc(U.safeColor(draft.color, '#4a5060')) + '" style="height:40px;padding:2px;width:100%"></div>' +
    '</div>' +
    '<fieldset class="fieldset"><legend>Monthly spending you put on it</legend>' +
      '<p class="field-hint" style="margin:0 0 10px">An estimate for rewards. Subscriptions marked as paid with this card and expenses logged on it are counted on top.</p>' +
      '<div class="field-row three">' + spendCats.map(function (cat) {
        return '<div class="field"><label for="sp-' + cat + '">' + esc((SPEND_CAT_BY_ID[cat] || {}).name || cat) +
          (d ? ' <span class="muted">' + V.multiplier(Object.assign({}, draft, { cardId: d.id }), cat) + (d.kind === 'cashback' ? '%' : 'x') + '</span>' : '') + '</label>' +
          '<input id="sp-' + cat + '" data-spend="' + cat + '" type="number" min="0" step="10" inputmode="decimal" value="' + (draft.spend[cat] || '') + '" placeholder="0"></div>';
      }).join('') + '</div></fieldset>' +
    (perks.length ? '<fieldset class="fieldset"><legend>What the perks are worth to you a year</legend><div class="field-row">' +
      perks.map(function (p) {
        return '<div class="field"><label for="pk-' + p.id + '">' + esc(p.name) + '</label><input id="pk-' + p.id + '" data-perk="' + p.id + '" type="number" min="0" step="10" value="' + (draft.perks[p.id] || '') + '" placeholder="0"></div>';
      }).join('') + '</div></fieldset>' : '') +
    (bonusOffer ? '<fieldset class="fieldset"><legend>Sign-up bonus</legend>' +
      '<label class="check"><input type="checkbox" id="cBonus"' + (draft.bonus ? ' checked' : '') + '> Track ' +
        (bonusOffer.cash ? M.fmtMoney(bonusOffer.amount, d.cur, { dec: 0 }) : bonusOffer.amount.toLocaleString('en-US') + ' ' + esc(d.unit)) +
        ' after ' + M.fmtMoney(bonusOffer.spend, d.cur, { dec: 0 }) + ' in ' + bonusOffer.months + ' months</label>' +
      '<div class="field-row"><div class="field"><label for="cBonusDeadline">Deadline</label><input id="cBonusDeadline" type="date" value="' + esc(draft.bonus && draft.bonus.deadline || defaultDeadline) + '"></div>' +
      '<div class="field"><label for="cBonusSpent">Spent so far</label><input id="cBonusSpent" type="number" min="0" step="10" value="' + esc(draft.bonus ? draft.bonus.spent : 0) + '">' +
        '<span class="field-hint">Expenses logged on the card count automatically.</span></div></div></fieldset>' : '') +
    (!d ? customFields(draft) : '') +
    '<div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="submit" class="btn btn-primary">' + (editing ? 'Save changes' : 'Add card') + '</button></div></form>';

  UI.openModal(editing ? 'Edit ' + draft.name : d ? 'Add ' + d.issuer + ' ' + d.name : 'Custom card', body, { focus: d ? '#cFeeDate' : '#cName' });
  const form = $('#cardForm');
  form.addEventListener('input', UI.markDirty);
  if (!d) wireCustomFields();

  $('#cOpened').addEventListener('change', function () {
    const dl = $('#cBonusDeadline');
    if (dl && !dl.value && this.value && bonusOffer) dl.value = D.addDays(addMonthsStr(this.value, bonusOffer.months), -1);
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const spend = {};
    $$('[data-spend]', form).forEach(function (i) { const n = parseFloat(i.value); if (n > 0) spend[i.dataset.spend] = n; });
    const perkVals = {};
    $$('[data-perk]', form).forEach(function (i) { const n = parseFloat(i.value); if (n > 0) perkVals[i.dataset.perk] = n; });
    const bonusOn = $('#cBonus') && $('#cBonus').checked;
    const name = $('#cName').value.trim() || (d ? d.name : '');
    if (!name) { $('#cName').focus(); UI.toast('Give the card a name.'); return; }
    const rec = ST.store.cleanCard(Object.assign({}, draft, {
      name: name,
      issuer: $('#cIssuer').value.trim(),
      fee: parseFloat($('#cFee').value) || 0,
      cur: $('#cCur').value,
      feeDate: $('#cFeeDate').value,
      openedAt: $('#cOpened').value,
      cpp: d && d.kind === 'cashback' ? 1 : parseFloat($('#cCpp').value),
      color: $('#cColor').value,
      spend: spend, perks: perkVals,
      bonus: bonusOn ? { spent: parseFloat($('#cBonusSpent').value) || 0, deadline: $('#cBonusDeadline').value, done: false } : null,
      customCredits: d ? draft.customCredits : readCustomCredits(),
      customEarn: d ? draft.customEarn : readCustomEarn()
    }));
    const list = st().cards;
    const i = list.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) list[i] = rec; else list.push(rec);
    ST.app.save();
    UI.closeModal(true);
    UI.toast(i >= 0 ? 'Saved.' : rec.name + ' added.');
    focusId = rec.id;
    ST.app.go('#/cards');
    ST.app.render();
  });
}

function addMonthsStr(s, n) {
  const d = D.parseYmd(s);
  if (!d) return s;
  D.addMonths(d, n);
  return D.ymd(d);
}

/* custom cards: their own earn rates and credits */
function customFields(draft) {
  const catOpts = function (sel) { return UI.spendCatOptions(sel); };
  const cadOpts = function (sel) {
    return UI.optionList(['monthly', 'quarterly', 'semiannual', 'yearly', 'cardyear', 'once'].map(function (c) { return { value: c, label: CADENCE_LABEL[c] }; }), sel);
  };
  const earnRows = (draft.customEarn.length ? draft.customEarn : [{ cat: 'other', x: 1 }]).map(function (e) {
    return '<div class="field-row three earn-row"><div class="field"><select data-ecat aria-label="Category">' + catOpts(e.cat) + '</select></div>' +
      '<div class="field"><input data-ex type="number" min="0" step="0.25" value="' + e.x + '" aria-label="Points per unit"></div>' +
      '<div class="field"><button class="btn btn-sm" type="button" data-rm-row>Remove</button></div></div>';
  }).join('');
  const creditRows = draft.customCredits.map(function (c) {
    return '<div class="field-row three credit-edit"><div class="field"><input data-cname type="text" value="' + esc(c.name) + '" aria-label="Credit name"></div>' +
      '<div class="field"><input data-camount type="number" min="0" step="1" value="' + c.amount + '" aria-label="Amount"></div>' +
      '<div class="field"><select data-ccad aria-label="How often">' + cadOpts(c.cadence) + '</select></div></div>';
  }).join('');
  return '<fieldset class="fieldset"><legend>Earn rates</legend><p class="field-hint" style="margin:0 0 10px">Points (or % for cash back) per unit of currency, by category.</p>' +
      '<div id="earnRows">' + earnRows + '</div><button class="btn btn-sm" type="button" id="addEarn">+ Earn rate</button></fieldset>' +
    '<fieldset class="fieldset"><legend>Credits</legend><div id="creditRows">' + creditRows + '</div>' +
      '<button class="btn btn-sm" type="button" id="addCredit">+ Credit</button></fieldset>';
}

function wireCustomFields() {
  $('#addEarn').addEventListener('click', function () {
    $('#earnRows').insertAdjacentHTML('beforeend', '<div class="field-row three earn-row"><div class="field"><select data-ecat aria-label="Category">' +
      UI.spendCatOptions('dining') + '</select></div><div class="field"><input data-ex type="number" min="0" step="0.25" value="2" aria-label="Points per unit"></div>' +
      '<div class="field"><button class="btn btn-sm" type="button" data-rm-row>Remove</button></div></div>');
  });
  $('#addCredit').addEventListener('click', function () {
    $('#creditRows').insertAdjacentHTML('beforeend', '<div class="field-row three credit-edit"><div class="field"><input data-cname type="text" placeholder="e.g. Travel credit" aria-label="Credit name"></div>' +
      '<div class="field"><input data-camount type="number" min="0" step="1" placeholder="Amount" aria-label="Amount"></div>' +
      '<div class="field"><select data-ccad aria-label="How often">' +
      UI.optionList(['monthly', 'quarterly', 'semiannual', 'yearly', 'cardyear', 'once'].map(function (c) { return { value: c, label: CADENCE_LABEL[c] }; }), 'yearly') +
      '</select></div></div>');
  });
  $('#earnRows').addEventListener('click', function (e) {
    const b = e.target.closest('[data-rm-row]');
    if (b) b.closest('.earn-row').remove();
  });
}

function readCustomEarn() {
  return $$('#earnRows .earn-row').map(function (r) {
    return { cat: $('[data-ecat]', r).value, x: parseFloat($('[data-ex]', r).value) || 0 };
  });
}
function readCustomCredits() {
  return $$('#creditRows .credit-edit').map(function (r) {
    return { name: $('[data-cname]', r).value.trim(), amount: parseFloat($('[data-camount]', r).value) || 0, cadence: $('[data-ccad]', r).value };
  }).filter(function (c) { return c.name && c.amount > 0; });
}

/* ─────────────────────────────  credit logging  ───────────────────────────── */

function openLog(card, creditId) {
  const cr = V.credits(card).filter(function (x) { return x.id === creditId; })[0];
  if (!cr) return;
  const now = V.creditNow(card, cr);
  const key = cr.cadence === 'once' ? 'once' : now.key;
  UI.openModal(cr.name,
    '<form id="logForm" novalidate><p class="sub" style="margin-bottom:12px">' + esc(card.name) + ' · ' + money(cr.amount, card) + ' ' + esc(CADENCE_LABEL[cr.cadence]) +
      ' · ' + esc(periodName(now, cr.cadence)) + (now.daysLeft != null ? ', resets ' + esc(D.fmtDate(D.addDays(now.to, 1), { day: 'numeric', month: 'short' })) : '') + '</p>' +
    '<div class="field"><label for="logAmt">How much of it have you used?</label>' +
      '<input id="logAmt" type="number" min="0" max="' + cr.amount + '" step="0.01" inputmode="decimal" value="' + (now.used || cr.amount) + '"></div>' +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button>' +
      (now.used ? '<button class="btn" type="button" id="logClear">Not used</button>' : '') +
      '<button class="btn btn-primary" type="submit">Save</button></div></form>', { focus: '#logAmt' });
  function save(v) {
    card.creditLog[cr.id] = card.creditLog[cr.id] || {};
    if (v > 0) card.creditLog[cr.id][key] = Math.min(cr.amount, v); else delete card.creditLog[cr.id][key];
    ST.app.save();
    UI.closeModal(true);
    ST.app.render();
  }
  $('#logForm').addEventListener('submit', function (e) { e.preventDefault(); save(parseFloat($('#logAmt').value) || 0); });
  if ($('#logClear')) $('#logClear').addEventListener('click', function () { save(0); });
}

/* ─────────────────────────────  wiring  ───────────────────────────── */

function render(route) {
  const pane = route.sub === 'browse' ? 'browse' : 'yours';
  const pf = V.portfolio(st());
  $('#cardsRoot').innerHTML =
    '<div class="view-head"><div><p class="eyebrow">' + (pf.cards.length ? U.plural(pf.cards.length, 'active card') + ' · values for this card-year' : 'What your cards pay you back') + '</p>' +
      '<h1 id="h-cards">Cards</h1></div>' +
      '<div class="view-actions"><button class="btn btn-ai" type="button" data-ai-action="cards" hidden><span aria-hidden="true">✦</span> Keep or cancel?</button>' +
        '<a class="btn" href="#/cards/browse">Browse cards</a>' +
      '<button class="btn btn-primary" type="button" data-card-custom>+ Custom card</button></div></div>' +
    '<nav class="subtabs" aria-label="Cards"><a href="#/cards"' + (pane === 'yours' ? ' aria-current="page"' : '') + '>Your cards</a>' +
      '<a href="#/cards/browse"' + (pane === 'browse' ? ' aria-current="page"' : '') + '>Browse cards</a></nav>' +
    (pane === 'yours' ? renderYours() : renderBrowse());
  if (focusId && pane === 'yours') {
    const el = $('#card-' + CSS.escape(focusId));
    if (el) el.scrollIntoView({ block: 'start' });
    focusId = null;
  }
}

function wire() {
  $('#cardsRoot').addEventListener('click', function (e) {
    const t = e.target;
    if (t.closest('[data-card-custom]')) return openForm(null, null);
    const add = t.closest('[data-add-card]');
    if (add) return openForm(null, add.dataset.addCard);
    const det = t.closest('[data-card-detail]');
    if (det) return openDetail(det.dataset.cardDetail);
    const mk = t.closest('[data-market]');
    if (mk) { browseMarket = mk.dataset.market; return ST.app.render(); }
    const box = t.closest('[data-card]');
    if (!box) return;
    const card = findCard(box.dataset.card);
    if (!card) return;
    const log = t.closest('[data-log]');
    if (log) return openLog(card, log.dataset.log);
    if (t.closest('[data-edit]')) return openForm(card);
    if (t.closest('[data-toggle]')) { card.active = !card.active; ST.app.save(); return ST.app.render(); }
    if (t.closest('[data-remove]')) {
      if (!confirm('Remove ' + card.name + ' and its credit history?')) return;
      st().cards = st().cards.filter(function (c) { return c.id !== card.id; });
      st().subs.forEach(function (s) { if (s.paidWith === card.id) s.paidWith = ''; });
      ST.app.save(); ST.app.render(); UI.toast('Removed.');
    }
  });
  $('#modalBody').addEventListener('click', function (e) {
    const add = e.target.closest('[data-add-card]');
    if (add) { UI.closeModal(true); openForm(null, add.dataset.addCard); }
  });
}

ST.views = ST.views || {};
ST.views.cards = {
  wire: wire, render: render,
  openAdd: function () { ST.app.go('#/cards/browse'); },
  focus: function (id) { focusId = id; ST.app.render(); }
};

})(window.ST = window.ST || {});
