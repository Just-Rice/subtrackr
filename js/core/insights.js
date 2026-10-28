/* insights.js — things worth telling you about, most urgent first.
 *
 * The overview shows only the single most urgent alert; the rest live on the
 * tab each one is about. Priority: a trial ending, a card credit about to
 * expire, a budget overspent, a catalogue price change, then a renewal due.
 * Each alert has a stable id so a dismissal sticks.
 */

(function (ST) {
'use strict';

const D = ST.dates, L = ST.ledger, M = ST.money;

function trialAlerts(st) {
  return L.activeSubs(st).filter(function (s) {
    const d = s.trialEnds ? D.daysUntil(s.trialEnds) : null;
    return d != null && d >= 0 && d <= 14;
  }).map(function (s) {
    const d = D.daysUntil(s.trialEnds);
    return {
      id: 'trial:' + s.id + ':' + s.trialEnds, priority: 1, tone: 'warn', date: s.trialEnds,
      title: s.name + ' free trial ends ' + (d <= 1 ? D.relDay(d) : 'in ' + d + ' days'),
      body: 'Cancel by ' + D.fmtDate(D.addDays(s.trialEnds, -1), { day: 'numeric', month: 'short' }) +
            ' or it renews at ' + M.fmtMoney(s.amount, s.cur) + ' ' + M.cycle(s.cycle).label.toLowerCase() + '.',
      action: { type: 'sub', id: s.id }
    };
  });
}

function renewalAlerts(st) {
  return L.activeSubs(st).map(function (s) { return { sub: s, date: L.nextCharge(s) }; })
    .filter(function (x) { return x.date && D.daysUntil(x.date) <= 2; })
    .map(function (x) {
      return {
        id: 'renew:' + x.sub.id + ':' + x.date, priority: 5, tone: 'info', date: x.date,
        title: x.sub.name + ' renews ' + D.relDay(D.daysUntil(x.date)),
        body: M.fmtMoney(x.sub.amount, x.sub.cur) + ' · ' + (x.sub.tierName || M.cycle(x.sub.cycle).label),
        action: { type: 'sub', id: x.sub.id }
      };
    });
}

/* every provider, filtered for dismissals, most urgent first */
function alerts(st) {
  let list = trialAlerts(st);
  if (ST.cardvalue) list = list.concat(ST.cardvalue.alerts(st));
  if (ST.budgets) list = list.concat(ST.budgets.alerts(st));
  if (ST.priceWatch) list = list.concat(ST.priceWatch.alerts(st));
  list = list.concat(renewalAlerts(st));
  return list.filter(function (a) { return !st.dismissed[a.id]; })
    .sort(function (a, b) { return a.priority - b.priority || (a.date < b.date ? -1 : 1); });
}

ST.insights = { alerts: alerts };

})(window.ST = window.ST || {});
