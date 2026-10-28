/* pricing.js — what a catalogue tier costs in a given market.
 *
 * Prices are stored in the local currency of the markets carried for them. For
 * any other market the US price is scaled by that market's price level (ppp)
 * and rounded to a sensible local step, then flagged as an estimate.
 */

(function (ST) {
'use strict';

const M = ST.money;

/* → { usd, monthlyUsd, exact, cycle, local: { amount, cur } }  |  null when not sold there */
function tierPrice(tier, regionCode) {
  const region = REGION_BY_CODE[regionCode] || REGION_BY_CODE.US;

  if (tier.only && tier.only.indexOf(region.code) === -1) return null;

  /* A tier's price is quoted per billing period. Most are monthly; Indian prepaid
     packs run 28 days, so 13 of them fall in a year, not 12. `perMonth` converts
     a charge into its monthly equivalent so tiers stay comparable. */
  const cyc = M.cycle(tier.cycle);
  function out(usd, exact, amount) {
    return { usd: usd, monthlyUsd: usd * cyc.perMonth, exact: exact,
             cycle: cyc, local: { amount: amount, cur: region.cur } };
  }

  if (tier.m[region.code] !== undefined) {
    const amt = tier.m[region.code];
    return out(M.toUsd(amt, region.cur), true, amt);
  }

  /* estimate from the US price (or the first price we have) and the market's price level */
  let baseUsd = null;
  if (tier.m.US !== undefined) {
    baseUsd = tier.m.US;
  } else {
    const keys = Object.keys(tier.m);
    if (!keys.length) return null;
    const src = REGION_BY_CODE[keys[0]];
    if (!src) return null;
    baseUsd = M.toUsd(tier.m[keys[0]], src.cur) / (src.ppp || 1);
  }

  if (baseUsd === 0) return out(0, true, 0);

  const localAmt = M.roundNice(M.fromUsd(baseUsd * region.ppp, region.cur), region.cur);
  return out(M.toUsd(localAmt, region.cur), false, localAmt);
}

/* What a tier charges per billing event, in local currency — the number a
   tracked subscription should record. Billed-yearly tiers charge the year. */
function tierCharge(tier, regionCode) {
  const p = tierPrice(tier, regionCode);
  if (!p) return null;
  if (tier.billedYearly) {
    const y = tier.y && tier.y[regionCode] != null ? tier.y[regionCode] : M.roundNice(p.local.amount * 12, p.local.cur);
    return { amount: y, cur: p.local.cur, cycle: 'yearly', exact: p.exact };
  }
  return { amount: p.local.amount, cur: p.local.cur, cycle: tier.cycle || 'monthly', exact: p.exact };
}

/* Carriers and ISPs only exist in their own market. Everything else is global. */
function availableHere(svc, regionCode) {
  const code = regionCode;
  if (svc.markets) return svc.markets.indexOf(code) !== -1;
  /* A fallback template only stands in where the catalogue carries no real
     provider for that market — it would just be noise next to actual carriers. */
  if (svc.fallbackOnly) {
    return !CATALOG.some(function (o) {
      return o.group === svc.group && o.markets && o.markets.indexOf(code) !== -1;
    });
  }
  return true;
}

/* Hulu has no service-level market lock, but every one of its tiers is US-only —
   so "can you buy it here" needs the tier check as well. */
function soldHere(svc, regionCode) {
  return availableHere(svc, regionCode) && svc.tiers.some(function (t) { return tierPrice(t, regionCode); });
}

/* the cheapest way to actually get the service — add-ons are skipped, since
   they only make sense stacked on a plan you are already paying for. Tiers are
   ranked on their monthly equivalent so a 28-day pack compares honestly. */
function cheapestPaidTier(svc, regionCode) {
  function scan(includeAddons) {
    let best = null;
    svc.tiers.forEach(function (t) {
      if (t.addon && !includeAddons) return;
      const p = tierPrice(t, regionCode);
      if (!p || p.usd <= 0) return;
      if (!best || p.monthlyUsd < best.usd) best = { usd: p.monthlyUsd, tier: t, price: p };
    });
    return best;
  }
  return scan(false) || scan(true);
}

function findTier(svc, name) {
  return svc ? svc.tiers.filter(function (t) { return t.name === name; })[0] || null : null;
}

ST.pricing = { tierPrice: tierPrice, tierCharge: tierCharge, availableHere: availableHere,
               soldHere: soldHere, cheapestPaidTier: cheapestPaidTier, findTier: findTier };

})(window.ST = window.ST || {});
