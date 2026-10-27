/* views/calendar.js — four weeks at a time: subscription charges, card fees,
 * card credits about to lapse and trials to cancel, with a total per week.
 * Selecting a day lists what is on it, with a way into each item.
 */

(function (ST) {
'use strict';

const U = ST.util, D = ST.dates, L = ST.ledger, UI = ST.ui;
const $ = UI.$, esc = U.esc;

const KINDS = [
  { id: 'charge', name: 'Charges' },
  { id: 'fee',    name: 'Card fees' },
  { id: 'credit', name: 'Credits expiring' },
  { id: 'trial',  name: 'Trials to cancel' }
];

let offset = 0;        /* in blocks of four weeks from this week */
let selected = null;

function st() { return ST.app.state; }
function rangeStart() { return D.addDays(D.weekStart(D.todayStr()), offset * 28); }

function evAmount(e) {
  if (e.kind === 'credit') return 'use ' + UI.usd(e.usd);
  if (e.kind === 'trial') return 'then ' + UI.usd(e.usd);
  return UI.usd(e.usd);
}

function render() {
  const from = rangeStart();
  const to = D.addDays(from, 27);
  const today = D.todayStr();
  const evs = L.events(st(), from, to);
  const byDay = {};
  evs.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });

  if (!selected || selected < from || selected > to) {
    const firstAhead = evs.filter(function (e) { return e.date >= today; })[0];
    selected = from <= today && today <= to ? (firstAhead ? firstAhead.date : today) : (evs[0] ? evs[0].date : from);
  }

  $('#calRange').textContent = D.fmtDate(from, { day: 'numeric', month: 'short' }) + ' – ' + D.fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' });
  $('#calLegend').innerHTML = KINDS.map(function (k) {
    return '<span><i style="background:var(--ev-' + k.id + '-bg);border-color:var(--ev-' + k.id + ')"></i>' + esc(k.name) + '</span>';
  }).join('');
  $('#icsBtn').hidden = !ST.ics;

  let html = '<div class="cal-inner"><div class="cal-row">' +
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('') +
    '<div class="cal-wk-head">Week</div></div>';

  for (let w = 0; w < 4; w++) {
    html += '<div class="cal-row">';
    let weekUsd = 0, weekCount = 0, weekFee = 0;
    for (let i = 0; i < 7; i++) {
      const day = D.addDays(from, w * 7 + i);
      const list = byDay[day] || [];
      list.forEach(function (e) {
        if (e.kind === 'charge' || e.kind === 'fee') { weekUsd += e.usd; weekCount++; }
        if (e.kind === 'fee') weekFee++;
      });
      const d = D.parseYmd(day);
      const label = (d.getDate() === 1 || (w === 0 && i === 0)) ? D.fmtDate(day, { day: 'numeric', month: 'short' }) : String(d.getDate());
      const cls = 'cal-day' + (day === today ? ' today' : '') + (day < today ? ' past' : '');
      html += '<button type="button" class="' + cls + '" data-day="' + day + '" aria-pressed="' + (day === selected) + '" ' +
        'aria-label="' + esc(D.fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })) +
        (list.length ? ', ' + U.plural(list.length, 'item') : '') + '">' +
        '<span class="cal-num">' + esc(label) + '</span>' +
        list.slice(0, 3).map(function (e) {
          return '<span class="ev ev-' + e.kind + '"><strong>' + esc(e.title) + '</strong><span>' + evAmount(e) + '</span></span>';
        }).join('') +
        (list.length > 3 ? '<span class="ev-more">+' + (list.length - 3) + ' more</span>' : '') +
        '</button>';
    }
    html += '<div class="cal-wk"><span class="num">' + UI.usd(weekUsd) + '</span>' +
      '<span class="muted">' + (weekCount ? U.plural(weekCount, 'charge') + (weekFee ? ' incl. a card fee' : '') : 'nothing due') + '</span></div></div>';
  }
  $('#calGrid').innerHTML = html + '</div>';

  renderDay(byDay[selected] || []);
}

function renderDay(list) {
  const host = $('#dayDetail');
  const head = '<div class="card-head"><h2>' + esc(D.fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })) + '</h2>' +
    '<span class="muted">' + D.relDay(D.daysUntil(selected)) + '</span></div>';
  if (!list.length) {
    host.innerHTML = head + '<p class="muted" style="margin:0">Nothing on this day.</p>';
    return;
  }
  host.innerHTML = head + '<ul class="rows">' + list.map(function (e, i) {
    const kind = KINDS.filter(function (k) { return k.id === e.kind; })[0];
    return '<li class="row" style="padding-left:0;padding-right:0">' + UI.dot(e.color) +
      '<span class="row-main"><span class="row-title">' + esc(e.title) + '</span>' +
      '<span class="row-sub">' + esc(kind ? kind.name.replace(/s$/, '') : '') + ' · ' + esc(e.detail || '') + '</span></span>' +
      '<span class="row-amt">' + evAmount(e) + '</span>' +
      '<button class="btn btn-sm" type="button" data-ev="' + i + '">Open</button></li>';
  }).join('') + '</ul>';
  host.querySelectorAll('[data-ev]').forEach(function (b) {
    b.addEventListener('click', function () { ST.app.act(list[Number(b.dataset.ev)].ref); });
  });
}

function wire() {
  $('#calPrev').addEventListener('click', function () { offset--; selected = null; render(); });
  $('#calNext').addEventListener('click', function () { offset++; selected = null; render(); });
  $('#calToday').addEventListener('click', function () { offset = 0; selected = D.todayStr(); render(); });
  $('#calGrid').addEventListener('click', function (e) {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    selected = b.dataset.day;
    render();
    const again = $('#calGrid [data-day="' + selected + '"]');
    if (again) again.focus();
  });
  $('#icsBtn').addEventListener('click', function () { if (ST.ics) ST.ics.exportFile(st()); });
}

ST.views = ST.views || {};
ST.views.calendar = { wire: wire, render: render };

})(window.ST = window.ST || {});
