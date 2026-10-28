/* views/spending.js — the Spending tab: a month of expenses with where it
 * went, statement import, recurring charges worth tracking, and budgets.
 */

(function (ST) {
'use strict';

const U = ST.util, M = ST.money, D = ST.dates, L = ST.ledger, B = ST.budgets, C = ST.csv, UI = ST.ui;
const $ = UI.$, $$ = UI.$$, esc = U.esc;

function st() { return ST.app.state; }

let month = null;          /* 'YYYY-MM' being viewed */
let filter = { cat: '', card: '', q: '' };
let pendingCsv = null;     /* { rows, map, sig } while the import dialog is open */

function cardName(id) { const c = st().cards.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ''; }
function catName(id) { return (SPEND_CAT_BY_ID[id] || SPEND_CAT_BY_ID.other).name; }

/* ─────────────────────────────  expenses  ───────────────────────────── */

function monthNav() {
  return '<div class="month-nav"><button class="icon-btn" type="button" data-month="-1" aria-label="Previous month">‹</button>' +
    '<strong>' + esc(D.fmtMonth(month)) + '</strong>' +
    '<button class="icon-btn" type="button" data-month="1" aria-label="Next month">›</button></div>';
}

function renderExpenses() {
  const s = st();
  const b = D.monthBounds(month);
  const all = L.expensesBetween(s, b.from, b.to).sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
  const loose = L.looseExpenses(all);
  const spend = U.sum(loose, L.expenseUsd);
  const subs = L.subsMonthlyUsd(s);
  const prevKey = D.shiftMonth(month, -1);
  const prev = L.monthSpendUsd(s, prevKey);
  const pb = D.monthBounds(prevKey);
  /* a month with a handful of expenses logged is not a fair comparison */
  const comparable = L.looseExpenses(L.expensesBetween(s, pb.from, pb.to)).length >= 5;
  const change = comparable && prev ? (spend - prev) / prev : null;

  const stats = '<div class="stats">' +
    UI.stat('Spending', UI.usd(spend), U.plural(loose.length, 'expense') + (all.length > loose.length ? ' · ' + (all.length - loose.length) + ' matched to subscriptions' : '')) +
    UI.stat('Subscriptions', UI.usd(subs), 'A month, from the Subscriptions tab') +
    UI.stat('Total out', UI.usd(spend + subs), 'Spending plus subscriptions') +
    UI.stat('Versus last month', change == null ? '—' : (change >= 0 ? '+' : '') + Math.round(change * 100) + '%',
      change != null ? UI.usd(prev) + ' in ' + D.fmtDate(prevKey + '-01', { month: 'long' })
        : 'Log a fuller month before to compare', change != null && change > 0.1 ? 'bad' : '') +
    '</div>';

  /* where it went, by top-level category, subscriptions included */
  const totals = L.categoryTotals(s, month);
  const rows = Object.keys(totals).map(function (k) { return { cat: SPEND_CAT_BY_ID[k], usd: totals[k] }; })
    .filter(function (r) { return r.usd > 0; }).sort(function (a, b) { return b.usd - a.usd; });
  const max = rows.length ? rows[0].usd : 1;
  const where = '<section class="card"><div class="card-head"><h2>Where it went</h2><a class="link-btn" href="#/spending/budgets">Budgets ›</a></div>' +
    (rows.length ? '<div class="bar-list">' + rows.map(function (r) {
      return '<div class="bar-item"><div class="bar-top"><span>' + esc(r.cat.name) + '</span><span class="num">' + UI.usd(r.usd) + '</span></div>' + UI.bar(r.usd / max) + '</div>';
    }).join('') + '</div>' : UI.empty('Nothing for ' + esc(D.fmtMonth(month)) + ' yet.')) + '</section>';

  /* charges that look like subscriptions you are not tracking */
  const rec = B.recurring(s);
  const recurring = rec.length ? '<section class="card card-flush"><div class="card-head"><h2>Looks like a subscription</h2>' +
    '<span class="muted">Regular charges you are not tracking</span></div><ul class="rows">' + rec.map(function (r) {
      return '<li class="row"><span class="row-main"><span class="row-title">' + esc(r.merchant) + '</span>' +
        '<span class="row-sub">' + M.fmtMoney(r.amount, r.cur) + ' ' + esc(M.cycle(r.cycle).label.toLowerCase()) + ' · ' + r.count + ' charges · next about ' +
        esc(D.fmtDate(r.next, { day: 'numeric', month: 'short' })) + '</span></span>' +
        '<span class="row-amt">' + UI.usd(r.yearUsd, { dec: 0 }) + '/yr</span>' +
        '<button class="btn btn-sm btn-primary" type="button" data-track="' + esc(r.key) + '">Track</button>' +
        '<button class="btn btn-sm" type="button" data-notsub="' + esc(r.key) + '">Not one</button></li>';
    }).join('') + '</ul></section>' : '';

  /* the list */
  const q = filter.q.toLowerCase();
  const shown = all.filter(function (e) {
    return (!filter.cat || spendRoot(e.cat) === filter.cat || e.cat === filter.cat) &&
           (!filter.card || e.cardId === filter.card) &&
           (!q || (e.merchant + ' ' + e.note + ' ' + e.tags.join(' ')).toLowerCase().indexOf(q) !== -1);
  });
  const byDay = {};
  shown.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const cards = s.cards;
  const list = '<section class="card card-flush"><div class="card-head"><h2>Expenses</h2>' +
    '<div class="filter-row">' +
      '<input type="search" id="expSearch" placeholder="Search" aria-label="Search expenses" value="' + esc(filter.q) + '">' +
      '<select id="expCat" aria-label="Category"><option value="">All categories</option>' + UI.spendCatOptions(filter.cat, { rootsOnly: true }) + '</select>' +
      (cards.length ? '<select id="expCard" aria-label="Card"><option value="">All cards</option>' +
        UI.optionList(cards.map(function (c) { return { value: c.id, label: c.name }; }), filter.card) + '</select>' : '') +
    '</div></div>' +
    (shown.length ? Object.keys(byDay).map(function (day) {
      return '<div class="day-head">' + esc(D.fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' })) + '</div>' +
        '<ul class="rows">' + byDay[day].map(function (e) {
          return '<li><button class="row" type="button" data-exp="' + esc(e.id) + '">' +
            '<span class="dot" aria-hidden="true" style="background:' + (SPEND_CAT_BY_ID[e.cat] || SPEND_CAT_BY_ID.other).color + '"></span>' +
            '<span class="row-main"><span class="row-title">' + esc(e.merchant || 'Expense') + '</span>' +
            '<span class="row-sub">' + esc(catName(e.cat)) + (e.cardId && cardName(e.cardId) ? ' · ' + esc(cardName(e.cardId)) : '') +
              (e.subId ? ' · subscription' : '') + (e.note ? ' · ' + esc(e.note) : '') + '</span></span>' +
            '<span class="row-amt' + (e.amount < 0 ? ' refund' : '') + '">' + UI.amt(e.amount, e.cur) + '</span></button></li>';
        }).join('') + '</ul>';
    }).join('')
    : UI.empty(all.length ? 'No expenses match.' : 'No expenses in ' + esc(D.fmtMonth(month)) + '. Add one, or import a statement.',
        all.length ? '' : '<div class="row-btns" style="justify-content:center"><button class="btn btn-primary" type="button" data-new-exp>+ Expense</button>' +
        '<button class="btn" type="button" data-import-csv>Import statement</button></div>')) +
    '</section>';

  return stats + recurring + '<div class="grid-2">' + '<div class="wide">' + list + '</div>' + '<div>' + where + '</div></div>';
}

/* ─────────────────────────────  budgets  ───────────────────────────── */

function renderBudgets() {
  const s = st();
  const status = B.status(s, month);
  const totals = L.categoryTotals(s, month);
  const budgeted = {};
  status.forEach(function (x) { budgeted[x.cat.id] = true; });
  const unbudgeted = Object.keys(totals).filter(function (k) { return !budgeted[k] && totals[k] > 0; })
    .sort(function (a, b) { return totals[b] - totals[a]; });
  const dayFrac = month === D.monthKey(D.todayStr())
    ? Number(D.todayStr().slice(8, 10)) / Number(D.monthBounds(month).to.slice(8, 10)) : 1;

  return '<section class="card"><div class="card-head"><h2>' + esc(D.fmtMonth(month)) + ' against budget</h2>' +
      '<button class="btn btn-sm btn-primary" type="button" data-set-budgets>' + (status.length ? 'Edit budgets' : 'Set budgets') + '</button></div>' +
    (status.length ? '<div class="bar-list">' + status.map(function (x) {
      const pace = !x.over && dayFrac < 1 && x.frac > dayFrac + 0.15;
      return '<div class="bar-item"><div class="bar-top"><span>' + esc(x.cat.name) + '</span>' +
        '<span class="num">' + UI.usd(x.spentUsd, { dec: 0 }) + ' <span class="muted">/ ' + UI.usd(x.limitUsd, { dec: 0 }) + '</span></span></div>' +
        UI.bar(x.frac, x.over ? 'over' : '') +
        '<span class="bar-note' + (x.over ? ' bad' : '') + '">' +
          (x.over ? 'Over by ' + UI.usd(-x.leftUsd, { dec: 0 }) : UI.usd(x.leftUsd, { dec: 0 }) + ' left' + (pace ? ' — ahead of pace for the month' : '')) +
        '</span></div>';
    }).join('') + '</div>'
    : UI.empty('No budgets yet. Set a monthly limit for the categories you want to watch — subscriptions count against theirs automatically.')) +
    '</section>' +
    (unbudgeted.length ? '<section class="card"><div class="card-head"><h2>Without a budget</h2></div><div class="bar-list">' +
      unbudgeted.map(function (k) {
        return '<div class="bar-top"><span>' + esc(SPEND_CAT_BY_ID[k].name) + '</span><span class="num">' + UI.usd(totals[k], { dec: 0 }) + '</span></div>';
      }).join('') + '</div></section>' : '');
}

function openBudgets() {
  const s = st();
  const cur = UI.settings().currency;
  const roots = SPEND_CATS.filter(function (c) { return !c.parent; });
  const totals = L.categoryTotals(s, D.monthKey(D.todayStr()));
  UI.openModal('Monthly budgets',
    '<form id="budgetForm" novalidate><p class="sub" style="margin-bottom:14px">In ' + esc(cur) + '. Leave a category empty for no budget. ' +
      'This month so far is shown beside each.</p><div class="field-row">' +
      roots.map(function (c) {
        const b = s.budgets.filter(function (x) { return x.cat === c.id; })[0];
        const val = b ? M.roundNice(M.fromUsd(M.toUsd(b.amount, b.cur), cur), cur) : '';
        return '<div class="field"><label for="bg-' + c.id + '">' + esc(c.name) + ' <span class="muted">' + (totals[c.id] ? UI.usd(totals[c.id], { dec: 0 }) + ' so far' : '') + '</span></label>' +
          '<input id="bg-' + c.id + '" data-budget="' + c.id + '" type="number" min="0" step="10" inputmode="decimal" value="' + val + '" placeholder="No budget"></div>';
      }).join('') + '</div>' +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save budgets</button></div></form>');
  $('#budgetForm').addEventListener('input', UI.markDirty);
  $('#budgetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    s.budgets = $$('[data-budget]').map(function (i) {
      const n = parseFloat(i.value);
      return n > 0 ? { id: U.uid(), cat: i.dataset.budget, amount: n, cur: cur } : null;
    }).filter(Boolean);
    ST.app.save(); UI.closeModal(true); ST.app.render(); UI.toast('Budgets saved.');
  });
}

/* ─────────────────────────────  expense form  ───────────────────────────── */

function openExpense(exp, preset) {
  const s = st();
  const editing = !!exp;
  const e = editing ? JSON.parse(JSON.stringify(exp)) : ST.store.cleanExpense(Object.assign({ cur: UI.region().cur, date: D.todayStr(), amount: '' }, preset || {}));
  const cards = s.cards.filter(function (c) { return c.active || c.id === e.cardId; });
  UI.openModal(editing ? 'Edit expense' : 'Add expense',
    '<form id="expForm" novalidate>' +
    '<div class="field-row">' +
      '<div class="field"><label for="eAmount">Amount</label><input id="eAmount" type="number" step="0.01" inputmode="decimal" required value="' + (e.amount === '' ? '' : esc(e.amount)) + '">' +
        '<span class="field-hint">A negative amount is a refund.</span></div>' +
      '<div class="field"><label for="eCur">Currency</label><select id="eCur">' + UI.currencyOptions(e.cur) + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="eMerchant">Where</label><input id="eMerchant" type="text" value="' + esc(e.merchant) + '" placeholder="Shop, restaurant, payee"></div>' +
      '<div class="field"><label for="eDate">Date</label><input id="eDate" type="date" value="' + esc(e.date) + '"></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="eCat">Category</label><select id="eCat">' + UI.spendCatOptions(e.cat) + '</select></div>' +
      '<div class="field"><label for="eCard">Paid with</label><select id="eCard"><option value="">— not a tracked card —</option>' +
        UI.optionList(cards.map(function (c) { return { value: c.id, label: c.name }; }), e.cardId) + '</select>' +
        '<span class="field-hint" id="eCardHint"></span></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="eSub">Subscription charge</label><select id="eSub"><option value="">— no —</option>' +
        UI.optionList(s.subs.map(function (x) { return { value: x.id, label: x.name }; }), e.subId) + '</select>' +
        '<span class="field-hint">Linked charges are not counted twice.</span></div>' +
      '<div class="field"><label for="eTags">Tags</label><input id="eTags" type="text" value="' + esc(e.tags.join(', ')) + '" placeholder="work, holiday"></div>' +
    '</div>' +
    '<div class="field"><label for="eNote">Note</label><input id="eNote" type="text" value="' + esc(e.note) + '"></div>' +
    '<div class="modal-foot">' + (editing ? '<button class="btn btn-danger" type="button" id="eDelete" style="margin-right:auto">Delete</button>' : '') +
      '<button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">' + (editing ? 'Save' : 'Add expense') + '</button></div></form>',
    { focus: '#eAmount' });

  const form = $('#expForm');
  form.addEventListener('input', UI.markDirty);
  /* guess the category from the merchant until the user picks one */
  let catTouched = editing;
  $('#eCat').addEventListener('change', function () { catTouched = true; hint(); });
  $('#eMerchant').addEventListener('input', function () {
    if (!catTouched) $('#eCat').value = C.guessCategory(this.value);
    hint();
  });
  function hint() {
    const best = ST.cardvalue && ST.cardvalue.bestCardFor(s, $('#eCat').value);
    $('#eCardHint').textContent = best ? 'Best card for ' + best.label.toLowerCase() + ': ' + best.card.name + '.' : '';
  }
  hint();

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const amount = parseFloat($('#eAmount').value);
    if (!isFinite(amount) || amount === 0) { $('#eAmount').focus(); UI.toast('Enter an amount.'); return; }
    const rec = ST.store.cleanExpense(Object.assign({}, e, {
      amount: amount, cur: $('#eCur').value, merchant: $('#eMerchant').value, date: $('#eDate').value,
      cat: $('#eCat').value, cardId: $('#eCard').value, subId: $('#eSub').value,
      tags: $('#eTags').value.split(','), note: $('#eNote').value.trim()
    }));
    const i = s.expenses.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) s.expenses[i] = rec; else s.expenses.push(rec);
    month = D.monthKey(rec.date);
    ST.app.save(); UI.closeModal(true);
    ST.app.go('#/spending'); ST.app.render();
    UI.toast(i >= 0 ? 'Saved.' : 'Added.');
  });
  if (editing) {
    $('#eDelete').addEventListener('click', function () {
      s.expenses = s.expenses.filter(function (x) { return x.id !== e.id; });
      ST.app.save(); UI.closeModal(true); ST.app.render(); UI.toast('Deleted.');
    });
  }
}

/* ─────────────────────────────  statement import  ───────────────────────────── */

function openImport() {
  UI.openModal('Import a statement',
    '<p class="sub" style="margin-bottom:12px">Export transactions as CSV from your bank or card provider\'s website. ' +
    'The file is read in this browser and never uploaded. Payments and refunds are skipped, and anything already imported is recognised.</p>' +
    '<div class="field"><label for="csvFile">CSV file</label><input id="csvFile" type="file" accept=".csv,text/csv"></div>' +
    '<div id="csvStep"></div>', { focus: '#csvFile' });
  $('#csvFile').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const rows = C.parse(reader.result);
      if (rows.length < 2) { UI.toast('That file has no rows to import.'); return; }
      const sig = C.signature(rows);
      const saved = st().csvMappings[sig];
      pendingCsv = { rows: rows, sig: sig, map: saved ? Object.assign({}, saved) : C.guessMapping(rows, UI.settings().region),
                     cur: saved && saved.cur ? saved.cur : UI.region().cur, cardId: saved && saved.cardId ? saved.cardId : '', remembered: !!saved };
      renderMapping();
    };
    reader.onerror = function () { UI.toast('That file could not be opened.'); };
    reader.readAsText(file);
  });
}

/* categories Gemini chose for lines no rule could place */
function withAiCats(res, p) {
  if (p.aiCats) res.expenses.forEach(function (e) { if (e.cat === 'other' && !e.subId && p.aiCats[e.merchant]) e.cat = p.aiCats[e.merchant]; });
  return res;
}

function renderMapping() {
  const p = pendingCsv;
  const head = p.map.hasHeader ? p.rows[0] : p.rows[0].map(function (_, i) { return 'Column ' + (i + 1); });
  function colSelect(id, label, val, optional) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '" data-map="' + id.slice(2).toLowerCase() + '">' +
      (optional ? '<option value="-1">— none —</option>' : '') +
      head.map(function (h, i) { return '<option value="' + i + '"' + (i === val ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>'; }).join('') +
      '</select></div>';
  }
  const res = withAiCats(C.toExpenses(p.rows, p.map, { cur: p.cur, cardId: p.cardId, st: st() }), p);
  const unsorted = ST.ai && ST.ai.enabled() ? ST.aidata.merchants(res.expenses) : [];
  const cards = st().cards.filter(function (c) { return c.active; });
  $('#csvStep').innerHTML =
    (p.remembered ? '<p class="tag tag-good" style="margin-bottom:12px">Using the columns you chose last time for this bank</p>' : '') +
    '<div class="field-row three">' + colSelect('m-date', 'Date', p.map.date) +
      (p.map.amount >= 0 || p.map.debit < 0 ? colSelect('m-amount', 'Amount', p.map.amount)
        : colSelect('m-debit', 'Money out', p.map.debit) ) +
      colSelect('m-merchant', 'Description', p.map.merchant) + '</div>' +
    '<div class="field-row three">' +
      '<div class="field"><label for="m-order">Date order</label><select id="m-order">' +
        UI.optionList([{ value: 'mdy', label: 'Month / day' }, { value: 'dmy', label: 'Day / month' }], p.map.order) + '</select></div>' +
      (p.map.amount >= 0 ? '<div class="field"><label for="m-flip">Spending shows as</label><select id="m-flip">' +
        UI.optionList([{ value: '0', label: 'Positive amounts' }, { value: '1', label: 'Negative amounts' }], p.map.flip ? '1' : '0') + '</select></div>' : '<div></div>') +
      '<div class="field"><label for="m-cur">Currency</label><select id="m-cur">' + UI.currencyOptions(p.cur) + '</select></div>' +
    '</div>' +
    (cards.length ? '<div class="field"><label for="m-card">Card this statement is for</label><select id="m-card"><option value="">— none / a bank account —</option>' +
      UI.optionList(cards.map(function (c) { return { value: c.id, label: c.name }; }), p.cardId) + '</select></div>' : '') +
    '<p class="sub"><strong>' + U.plural(res.expenses.length, 'new expense') + '</strong>' +
      (res.duplicates ? ' · ' + res.duplicates + ' already imported' : '') +
      (res.credits ? ' · ' + U.plural(res.credits, 'payment or refund', 'payments or refunds') + ' skipped' : '') +
      (res.skipped ? ' · ' + U.plural(res.skipped, 'row') + ' unreadable' : '') + '</p>' +
    (res.expenses.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>' +
      res.expenses.slice(0, 8).map(function (e) {
        return '<tr><td>' + esc(D.fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })) + '</td><td>' + esc(e.merchant) +
          (e.subId ? ' <span class="tag tag-good">subscription</span>' : '') + '</td><td>' + esc(catName(e.cat)) + '</td>' +
          '<td class="num">' + M.fmtMoney(e.amount, e.cur) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (res.expenses.length > 8 ? '<p class="muted">…and ' + (res.expenses.length - 8) + ' more.</p>' : '') : '') +
    (unsorted.length ? '<p class="sub" style="margin-top:10px">' + U.plural(unsorted.length, 'description') + ' landed in “Everything else”. ' +
      '<button class="link-btn" type="button" id="csvAi">✦ Sort them with Gemini</button></p>' : '') +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button>' +
      '<button class="btn btn-primary" type="button" id="csvGo"' + (res.expenses.length ? '' : ' disabled') + '>Import ' + U.plural(res.expenses.length, 'expense') + '</button></div>';

  $$('#csvStep select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      if (sel.dataset.map) p.map[sel.dataset.map] = Number(sel.value);
      if (sel.id === 'm-order') p.map.order = sel.value;
      if (sel.id === 'm-flip') p.map.flip = sel.value === '1';
      if (sel.id === 'm-cur') p.cur = sel.value;
      if (sel.id === 'm-card') p.cardId = sel.value;
      renderMapping();
    });
  });
  if ($('#csvAi')) $('#csvAi').addEventListener('click', function () {
    const btn = this;
    btn.disabled = true; btn.textContent = 'Asking Gemini…';
    ST.ai.categorise(unsorted).then(function (cats) {
      p.aiCats = Object.assign({}, p.aiCats, cats);
      const n = Object.keys(cats).length;
      UI.openModal('Import a statement', '<div id="csvStep"></div>');
      renderMapping();
      UI.toast(n ? 'Gemini sorted ' + U.plural(n, 'description') + '.' : 'Gemini wasn’t sure about any of them.');
    }).catch(function (err) {
      UI.openModal('Import a statement', '<div id="csvStep"></div>');
      renderMapping();
      if (err.message !== 'cancelled') UI.toast(err.message);
    });
  });
  $('#csvGo').addEventListener('click', function () {
    const s = st();
    const out = withAiCats(C.toExpenses(p.rows, p.map, { cur: p.cur, cardId: p.cardId, st: s }), p);
    out.expenses.forEach(function (e) { s.expenses.push(e); });
    s.csvMappings[p.sig] = Object.assign({}, p.map, { cur: p.cur, cardId: p.cardId });
    const latest = out.expenses.reduce(function (m, e) { return e.date > m ? e.date : m; }, '');
    if (latest) month = D.monthKey(latest);
    pendingCsv = null;
    ST.app.save(); UI.closeModal(true); ST.app.go('#/spending'); ST.app.render();
    UI.toast('Imported ' + U.plural(out.expenses.length, 'expense') + '.');
  });
}

/* ─────────────────────────────  wiring  ───────────────────────────── */

function trackRecurring(key) {
  const r = B.recurring(st()).filter(function (x) { return x.key === key; })[0];
  if (!r) return;
  ST.views.subs.openForm(null, null, null);
  /* prefill the custom form from the charges */
  setTimeout(function () {
    if (!$('#subForm')) return;
    $('#fName').value = r.merchant.replace(/[*#].*$/, '').trim();
    $('#fAmount').value = r.amount;
    $('#fCur').value = r.cur;
    $('#fCycle').value = r.cycle;
    $('#fNext').value = D.nextOnOrAfter(r.next, r.cycle);
  }, 0);
}

function render(route) {
  const pane = route.sub === 'budgets' ? 'budgets' : 'expenses';
  if (!month) month = D.monthKey(D.todayStr());
  $('#spendingRoot').innerHTML =
    '<div class="view-head"><div><p class="eyebrow">' + (st().expenses.length ? U.plural(st().expenses.length, 'expense') + ' logged' : 'Everything that is not a subscription') + '</p>' +
      '<h1 id="h-spending">Spending</h1></div>' +
      '<div class="view-actions">' + monthNav() +
        '<button class="btn btn-ai" type="button" data-ai-action="review" hidden>✦ Review my month</button>' +
        '<button class="btn" type="button" data-import-csv>Import statement</button>' +
        '<button class="btn btn-primary" type="button" data-new-exp>+ Expense</button></div></div>' +
    '<nav class="subtabs" aria-label="Spending"><a href="#/spending"' + (pane === 'expenses' ? ' aria-current="page"' : '') + '>Expenses</a>' +
      '<a href="#/spending/budgets"' + (pane === 'budgets' ? ' aria-current="page"' : '') + '>Budgets</a></nav>' +
    (pane === 'budgets' ? renderBudgets() : renderExpenses());
}

function wire() {
  const root = $('#spendingRoot');
  root.addEventListener('click', function (e) {
    const t = e.target;
    const m = t.closest('[data-month]');
    if (m) { month = D.shiftMonth(month, Number(m.dataset.month)); return ST.app.render(); }
    if (t.closest('[data-new-exp]')) return openExpense(null);
    if (t.closest('[data-import-csv]')) return openImport();
    if (t.closest('[data-set-budgets]')) return openBudgets();
    const ex = t.closest('[data-exp]');
    if (ex) { const x = st().expenses.filter(function (y) { return y.id === ex.dataset.exp; })[0]; if (x) openExpense(x); return; }
    const tr = t.closest('[data-track]');
    if (tr) return trackRecurring(tr.dataset.track);
    const ns = t.closest('[data-notsub]');
    if (ns) { st().dismissed['recur:' + ns.dataset.notsub] = true; ST.app.save(); ST.app.render(); }
  });
  root.addEventListener('input', function (e) {
    if (e.target.id !== 'expSearch') return;
    filter.q = e.target.value;
    ST.app.render();
    const s = $('#expSearch');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'expCat') { filter.cat = e.target.value; ST.app.render(); }
    if (e.target.id === 'expCard') { filter.card = e.target.value; ST.app.render(); }
  });
}

ST.views = ST.views || {};
ST.views.spending = { wire: wire, render: render, openExpense: openExpense, openImport: openImport };

})(window.ST = window.ST || {});
