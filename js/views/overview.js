/* views/overview.js — the glance. Three numbers, the next three charges and
 * the single most urgent alert. Every block is a button into the tab that
 * holds the detail, so the home screen stays short.
 */

(function (ST) {
'use strict';

const U = ST.util, D = ST.dates, L = ST.ledger, UI = ST.ui;
const $ = UI.$, esc = U.esc;

function st() { return ST.app.state; }

function tile(o) {
  return '<a class="gtile" href="' + o.href + '">' +
    '<span class="gtile-label">' + esc(o.label) + '</span>' +
    '<span class="gtile-value' + (o.cls ? ' ' + o.cls : '') + '">' + o.value + '</span>' +
    '<span class="gtile-note">' + o.note + '</span>' +
    '<span class="gtile-cta">' + esc(o.cta) + ' ›</span></a>';
}

const CLOCK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

function render() {
  const s = st();
  const today = D.todayStr();
  $('#todayLabel').textContent = D.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' });

  if (!s.subs.length && !s.cards.length && !s.expenses.length) {
    $('#glance').innerHTML = '<section class="card">' + UI.empty(
      'Nothing tracked yet. Start with a subscription from the catalogue — prices are already filled in for ' +
      esc(UI.region().name) + '.',
      '<div class="row-btns" style="justify-content:center">' +
        '<a class="btn btn-primary" href="#/subs/browse">Browse subscriptions</a>' +
        '<a class="btn" href="#/cards">Add a credit card</a>' +
        '<a class="btn" href="#/spending">Log spending</a></div>') + '</section>';
    return;
  }

  /* tile 1: what goes out this month */
  const subsUsd = L.subsMonthlyUsd(s);
  const spendUsd = L.monthSpendUsd(s, D.monthKey(today));
  const month = D.fmtDate(today, { month: 'long' });
  const t1 = tile({ href: '#/spending', label: 'Out in ' + month, value: UI.usd(subsUsd + spendUsd),
    note: s.expenses.length ? 'Subscriptions ' + UI.usd(subsUsd) + ' · spending ' + UI.usd(spendUsd)
                            : 'Subscriptions, a month · log spending to add it',
    cta: 'Spending' });

  /* tile 2: the next charge */
  const next = L.upcoming(s, 1, 120)[0];
  const t2 = tile({ href: '#/calendar', label: 'Next charge', value: next ? UI.usd(next.usd) : '—',
    note: next ? esc(next.title) + ' · ' + D.relDay(D.daysUntil(next.date)) : 'Add renewal dates to see them',
    cta: 'Calendar' });

  /* tile 3: what the cards are paying back */
  let t3;
  const cv = ST.cardvalue ? ST.cardvalue.portfolio(s) : null;
  if (cv && cv.cards.length) {
    t3 = tile({ href: '#/cards', label: 'Card value this year', value: UI.usd(cv.netUsd, { sign: true, dec: 0 }),
      cls: cv.netUsd >= 0 ? 'good' : 'bad',
      note: cv.unclaimedUsd > 0 ? UI.usd(cv.unclaimedUsd, { dec: 0 }) + ' still unclaimed' : 'Every credit used',
      cta: 'Cards' });
  } else {
    t3 = tile({ href: '#/cards', label: 'Card value', value: '—', note: 'Add a card to see what it pays you back', cta: 'Cards' });
  }

  /* three on a phone or a short window; a tall screen shows five (CSS) */
  const up = L.upcoming(s, 5, 60);
  const upHtml = '<section class="card card-flush"><div class="card-head"><h2>Coming up</h2>' +
    '<a class="link-btn" href="#/calendar">See all in Calendar ›</a></div>' +
    (up.length ? '<ul class="rows">' + up.map(function (e, i) {
      return '<li class="row' + (i >= 3 ? ' row-extra' : '') + '"><span class="row-when">' + esc(D.fmtDate(e.date, { weekday: 'short', day: 'numeric' })) + '</span>' +
        UI.dot(e.color) + '<span class="row-main"><span class="row-title">' + esc(e.title) + '</span></span>' +
        '<span class="row-amt">' + UI.usd(e.usd) + '</span></li>';
    }).join('') + '</ul>'
    : UI.empty('No charges dated in the next 60 days. Set a next-payment date on a subscription to see it here.')) +
    '</section>';

  const alert = ST.insights.alerts(s)[0];
  const alertHtml = alert
    ? '<button class="alert' + (alert.tone === 'info' ? ' info' : '') + '" type="button" data-alert="' + esc(alert.id) + '">' + CLOCK +
        '<span class="alert-text"><span class="alert-title">' + esc(alert.title) + '</span>' +
        '<span class="alert-body">' + esc(alert.body) + '</span></span>' +
        '<span class="alert-go">Review ›</span></button>'
    : '';

  $('#glance').innerHTML = '<div class="gtiles">' + t1 + t2 + t3 + '</div>' + upHtml + alertHtml;
}

function wire() {
  $('#glance').addEventListener('click', function (e) {
    const b = e.target.closest('[data-alert]');
    if (!b) return;
    const a = ST.insights.alerts(st()).filter(function (x) { return x.id === b.dataset.alert; })[0];
    if (a) ST.app.act(a.action);
  });
}

ST.views = ST.views || {};
ST.views.overview = { wire: wire, render: render };

})(window.ST = window.ST || {});
