/* advisor.js — ways to spend less on what you already have.
 *
 *   downgrade   a cheaper tier of the same service, one step down
 *   overlap     two services doing the same job (two music apps)
 *   covered     a card you hold has a credit for it, but it is paid otherwise
 *   better card a card you hold earns noticeably more on it
 *   low use     cost per use is high — from the "+1 use" counts
 */

(function (ST) {
'use strict';

const D = ST.dates, M = ST.money, P = ST.pricing, L = ST.ledger, U = ST.util;

/* the latest month with uses counted, this month or last → { usd, uses, month } */
function costPerUse(sub) {
  const now = D.monthKey(D.todayStr());
  const prev = D.shiftMonth(now, -1);
  const key = sub.uses[now] ? now : sub.uses[prev] ? prev : null;
  if (!key) return null;
  return { usd: L.monthlyUsd(sub) / sub.uses[key], uses: sub.uses[key], month: key };
}

function tips(st) {
  const region = st.settings.region;
  const subs = L.activeSubs(st);
  const out = [];

  subs.forEach(function (s) {
    const svc = SERVICE_BY_ID[s.serviceId];
    const tier = P.findTier(svc, s.tierName);
    if (!tier || tier.addon) return;
    const cur = P.tierPrice(tier, region);
    if (!cur || !cur.usd) return;
    /* the closest cheaper tier, not the bare-bones one */
    const lower = svc.tiers.map(function (t) { return { t: t, p: P.tierPrice(t, region) }; })
      /* student and member-only tiers need an eligibility nobody can assume */
      .filter(function (x) { return x.t !== tier && !x.t.addon && !/student|prime member/i.test(x.t.name) &&
                                    x.p && x.p.monthlyUsd > 0 && x.p.monthlyUsd < cur.monthlyUsd * 0.97; })
      .sort(function (a, b) { return b.p.monthlyUsd - a.p.monthlyUsd; })[0];
    if (!lower) return;
    const save = (cur.monthlyUsd - lower.p.monthlyUsd) * 12 / L.share(s);
    if (save < 12) return;
    const lose = tier.benefits.filter(function (b) { return lower.t.benefits.indexOf(b) === -1; })[0];
    out.push({ id: 'down:' + s.id, kind: 'downgrade', saveUsd: save,
      title: s.name + ': ' + s.tierName + ' → ' + lower.t.name,
      body: 'One tier down' + (lose ? ' — you would give up “' + lose + '”' : '') + '.' });
  });

  /* two subscriptions in the same catalogue group */
  const byGroup = {};
  subs.forEach(function (s) { if (s.group) (byGroup[s.group] = byGroup[s.group] || []).push(s); });
  Object.keys(byGroup).forEach(function (g) {
    const list = byGroup[g];
    if (list.length < 2 || g === 'connect.mobile' || g === 'connect.home') return;
    const sorted = list.slice().sort(function (a, b) { return L.monthlyUsd(a) - L.monthlyUsd(b); });
    out.push({ id: 'overlap:' + g, kind: 'overlap', saveUsd: L.monthlyUsd(sorted[0]) * 12,
      title: list.map(function (s) { return s.name; }).join(' and ') + ' overlap',
      body: 'Both are ' + GROUP_BY_ID[g].name.toLowerCase() + '. Dropping ' + sorted[0].name + ' saves the most you can without losing the category.' });
  });

  if (ST.cardvalue) {
    subs.forEach(function (s) {
      const cov = ST.cardvalue.coverFor(st, s);
      if (cov && s.paidWith !== cov.card.id) {
        out.push({ id: 'cover:' + s.id, kind: 'covered', saveUsd: cov.yearUsd,
          title: 'Pay ' + s.name + ' with ' + cov.card.name,
          body: 'Its ' + cov.credit.name.toLowerCase() + ' credit pays for it' + (s.paidWith ? ' — it is on another card now.' : '.') });
        return;
      }
      const best = ST.cardvalue.bestCardFor(st, L.subSpendCat(s));
      if (!best || best.card.id === s.paidWith) return;
      const curCard = st.cards.filter(function (c) { return c.id === s.paidWith; })[0];
      const curRate = curCard ? ST.cardvalue.rewardRate(curCard, L.subSpendCat(s)) : 0;
      const gainUsd = (best.rate - curRate) * L.monthlyUsd(s) * L.share(s) * 12;
      if (best.rate - curRate < 0.01 || gainUsd < 3) return;
      out.push({ id: 'card:' + s.id, kind: 'card', saveUsd: gainUsd,
        title: 'Pay ' + s.name + ' with ' + best.card.name,
        body: Math.round(best.rate * 1000) / 10 + '% back on ' + best.label.toLowerCase() +
              (curCard ? ' instead of ' + Math.round(curRate * 1000) / 10 + '% on ' + curCard.name : '') + '.' });
    });
  }

  subs.forEach(function (s) {
    const cpu = costPerUse(s);
    if (!cpu || cpu.uses > 4 || cpu.usd < 3) return;
    out.push({ id: 'use:' + s.id, kind: 'lowuse', saveUsd: L.monthlyUsd(s) * 12,
      title: s.name + ' costs ' + M.fmtMoney(cpu.usd, 'USD') + ' a use',
      body: U.plural(cpu.uses, 'use') + ' in ' + D.fmtMonth(cpu.month) + '. Worth pausing?' });
  });

  return out.filter(function (t) { return !st.dismissed['tip:' + t.id]; })
    .sort(function (a, b) { return b.saveUsd - a.saveUsd; });
}

ST.advisor = { tips: tips, costPerUse: costPerUse };

})(window.ST = window.ST || {});
