/* money.js — exchange rates, rounding, formatting and billing cycles.
 *
 * Every internal total is carried in US dollars and converted for display at
 * the last moment. Rates only ever change the display currency; a market's
 * list price comes from the catalogue, never from a conversion.
 */

(function (ST) {
'use strict';

/* { CUR: units per USD } from the live feed, or null for the static table */
let liveRates = null;

function setRates(rates) { liveRates = rates && typeof rates === 'object' ? rates : null; }

function rate(cur) {
  if (liveRates && typeof liveRates[cur] === 'number' && liveRates[cur] > 0) return liveRates[cur];
  return (CURRENCIES[cur] || CURRENCIES.USD).rate;
}

function toUsd(amount, cur) { return amount / rate(cur); }
function fromUsd(usd, cur) { return usd * rate(cur); }

function roundNice(value, cur) {
  const dec = (CURRENCIES[cur] || CURRENCIES.USD).dec;
  if (dec > 0) return Math.round(value * 100) / 100;
  const v = Math.abs(value);
  let step = 1;
  if (v >= 50000) step = 1000;
  else if (v >= 5000) step = 100;
  else if (v >= 500) step = 10;
  else if (v >= 50) step = 5;
  return Math.round(value / step) * step;
}

/* opts.dec overrides the currency's decimals; opts.sign forces a leading + */
function fmtMoney(amount, cur, opts) {
  const c = CURRENCIES[cur] || CURRENCIES.USD;
  const o = opts || {};
  const dec = o.dec != null ? o.dec : c.dec;
  const value = Number(amount);
  if (!isFinite(value)) return c.symbol + '—';
  const sign = value < 0 ? '-' : (o.sign && value > 0 ? '+' : '');
  const abs = Math.abs(value);
  const n = abs >= 1000 && dec === 0
    ? Math.round(abs).toLocaleString('en-US')
    : abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return sign + c.symbol + n;
}

const CYCLES = [
  { id: 'weekly',     label: 'Weekly',         perMonth: 52 / 12 },
  { id: 'fourweekly', label: 'Every 28 days',  perMonth: 365.25 / 28 / 12 },
  { id: 'monthly',    label: 'Monthly',        perMonth: 1 },
  { id: 'quarterly',  label: 'Every 3 months', perMonth: 1 / 3 },
  { id: 'semiannual', label: 'Every 6 months', perMonth: 1 / 6 },
  { id: 'yearly',     label: 'Yearly',         perMonth: 1 / 12 }
];
const CYCLE_BY_ID = Object.fromEntries(CYCLES.map(function (c) { return [c.id, c]; }));

function cycle(id) { return CYCLE_BY_ID[id] || CYCLE_BY_ID.monthly; }

/* a USD total, shown in the currency the person chose */
function fmtUsdAs(usd, cur, opts) { return fmtMoney(fromUsd(usd, cur), cur, opts); }

ST.money = { setRates: setRates, rate: rate, toUsd: toUsd, fromUsd: fromUsd,
             roundNice: roundNice, fmtMoney: fmtMoney, fmtUsdAs: fmtUsdAs, CYCLES: CYCLES, CYCLE_BY_ID: CYCLE_BY_ID, cycle: cycle };

})(window.ST = window.ST || {});
