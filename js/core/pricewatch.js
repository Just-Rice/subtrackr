/* pricewatch.js — notice when a catalogue list price moves under a tracked
 * subscription.
 *
 * A subscription added from the catalogue remembers the list price it was
 * quoted (sub.quoted) in the market it was quoted for. When the catalogue's
 * price for that tier and market no longer matches, that is a price change
 * worth surfacing — the publisher has raised (or cut) it since.
 */

(function (ST) {
'use strict';

const P = ST.pricing, M = ST.money, L = ST.ledger;

/* → { svc, tier, was: {amount, cur}, now: {amount, cur, cycle}, diffUsd, yearUsd } | null */
function changeFor(st, sub) {
  if (!sub.quoted || !sub.quoted.region) return null;
  const svc = SERVICE_BY_ID[sub.serviceId];
  const tier = P.findTier(svc, sub.tierName);
  if (!tier) return null;
  const now = P.tierCharge(tier, sub.quoted.region);
  if (!now || !now.exact || now.cur !== sub.quoted.cur) return null;
  if (Math.abs(now.amount - sub.quoted.amount) < 0.005) return null;
  const diffUsd = M.toUsd(now.amount - sub.quoted.amount, now.cur);
  return { svc: svc, tier: tier, was: { amount: sub.quoted.amount, cur: sub.quoted.cur }, now: now,
           diffUsd: diffUsd, yearUsd: diffUsd * M.cycle(now.cycle).perMonth * 12 / L.share(sub) };
}

function alerts(st) {
  return L.activeSubs(st).map(function (s) { return { sub: s, ch: changeFor(st, s) }; })
    .filter(function (x) { return x.ch; })
    .map(function (x) {
      const up = x.ch.diffUsd > 0;
      return {
        id: 'price:' + x.sub.id + ':' + x.ch.now.amount, priority: 4, tone: up ? 'warn' : 'info', date: '',
        title: x.sub.name + ' ' + x.sub.tierName + ' is now ' + M.fmtMoney(x.ch.now.amount, x.ch.now.cur),
        body: 'Was ' + M.fmtMoney(x.ch.was.amount, x.ch.was.cur) + ' when you added it — ' +
              (up ? 'about ' : 'saves about ') + M.fmtUsdAs(Math.abs(x.ch.yearUsd), st.settings.currency, { dec: 0 }) + ' a year' +
              (up ? ' more' : '') + '. Update your amount?',
        action: { type: 'price', id: x.sub.id }
      };
    });
}

/* take the new list price: update the amount, or just acknowledge it */
function accept(sub, ch, updateAmount) {
  if (updateAmount) { sub.amount = ch.now.amount; sub.cur = ch.now.cur; sub.cycle = ch.now.cycle; }
  sub.quoted = { amount: ch.now.amount, cur: ch.now.cur, at: ST.dates.todayStr(), region: sub.quoted.region };
}

ST.priceWatch = { changeFor: changeFor, alerts: alerts, accept: accept };

})(window.ST = window.ST || {});
