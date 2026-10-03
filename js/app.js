/* app.js — state, pricing, rendering. No dependencies, no network required. */

(function () {
'use strict';

/* ─────────────────────────────  storage  ───────────────────────────── */

const KEY = 'subtrackr.v1';

const DEFAULT_STATE = {
  region: 'US',
  currency: 'USD',
  theme: 'auto',
  subs: [],
  compare: [],
  fx: null            /* { rates: {...}, at: epochMs } */
};

/* A fresh copy every time — Object.assign is shallow, so handing out
   DEFAULT_STATE's own arrays would let edits leak back into the template. */
function freshState() {
  return Object.assign({}, DEFAULT_STATE, { subs: [], compare: [] });
}

/* Saved data can be hand-edited, imported from an old export, or written by a
   future version. Pin the fields the whole app indexes on to known-good values
   so one bad string cannot make pricing and availability disagree. */
function sanitise(st) {
  if (!REGION_BY_CODE[st.region]) st.region = DEFAULT_STATE.region;
  if (!CURRENCIES[st.currency]) st.currency = REGION_BY_CODE[st.region].cur;
  if (['auto', 'light', 'dark'].indexOf(st.theme) === -1) st.theme = 'auto';
  st.subs = st.subs.filter(function (s) { return s && typeof s === 'object'; }).map(function (s) {
    return Object.assign({}, s, {
      id: s.id || uid(),
      name: String(s.name == null ? 'Untitled' : s.name),
      amount: isFinite(Number(s.amount)) ? Number(s.amount) : 0,
      cur: CURRENCIES[s.cur] ? s.cur : DEFAULT_STATE.currency,
      cycle: CYCLE_BY_ID[s.cycle] ? s.cycle : 'monthly',
      nextDate: parseYmd(s.nextDate) ? s.nextDate : '',
      benefits: Array.isArray(s.benefits) ? s.benefits : []
    });
  });
  st.compare = st.compare.filter(function (id) { return SERVICE_BY_ID[id]; });
  return st;
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return freshState();
    const merged = Object.assign(freshState(), parsed, {
      subs: Array.isArray(parsed.subs) ? parsed.subs : [],
      compare: Array.isArray(parsed.compare) ? parsed.compare : []
    });
    return sanitise(merged);
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
    return freshState();
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save — browser storage is unavailable.'); }
  }, 120);
}

let state;   /* assigned once the helpers sanitise() leans on are defined */

/* ─────────────────────────────  helpers  ───────────────────────────── */

const $  = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

function initials(name) {
  const words = name.replace(/[^A-Za-z0-9 +]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ─────────────────────────────  money  ───────────────────────────── */

/* Never let a stale or hand-edited region code take the whole page down. */
function currentRegion() { return REGION_BY_CODE[state.region] || REGION_BY_CODE.US; }

function rate(cur) {
  if (state.fx && state.fx.rates && typeof state.fx.rates[cur] === 'number') return state.fx.rates[cur];
  return (CURRENCIES[cur] || CURRENCIES.USD).rate;
}

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

function fmtMoney(amount, cur, opts) {
  const c = CURRENCIES[cur] || CURRENCIES.USD;
  const o = opts || {};
  const dec = o.dec != null ? o.dec : c.dec;
  const value = Number(amount);
  if (!isFinite(value)) return c.symbol + '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const n = abs >= 1000 && dec === 0
    ? Math.round(abs).toLocaleString('en-US')
    : abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return sign + c.symbol + n;
}

const CYCLES = [
  { id: 'weekly',     label: 'Weekly',        perMonth: 52 / 12 },
  { id: 'fourweekly', label: 'Every 28 days', perMonth: 365.25 / 28 / 12 },
  { id: 'monthly',    label: 'Monthly',       perMonth: 1 },
  { id: 'quarterly',  label: 'Every 3 months', perMonth: 1 / 3 },
  { id: 'semiannual', label: 'Every 6 months', perMonth: 1 / 6 },
  { id: 'yearly',     label: 'Yearly',        perMonth: 1 / 12 }
];
const CYCLE_BY_ID = Object.fromEntries(CYCLES.map(function (c) { return [c.id, c]; }));

/* Price of a tier in a given market.
   → { usd, exact, local: { amount, cur } }  |  null when the tier isn't sold there */
function tierPrice(tier, regionCode) {
  const region = REGION_BY_CODE[regionCode] || REGION_BY_CODE.US;

  if (tier.only && tier.only.indexOf(region.code) === -1) return null;

  /* A tier's price is quoted per billing period. Most are monthly; Indian prepaid
     packs run 28 days, so 13 of them fall in a year, not 12. `perMonth` converts
     a charge into its monthly equivalent so tiers stay comparable. */
  const cyc = CYCLE_BY_ID[tier.cycle] || CYCLE_BY_ID.monthly;
  function out(usd, exact, amount) {
    return { usd: usd, monthlyUsd: usd * cyc.perMonth, exact: exact,
             cycle: cyc, local: { amount: amount, cur: region.cur } };
  }

  if (tier.m[region.code] !== undefined) {
    const amt = tier.m[region.code];
    return out(amt / rate(region.cur), true, amt);
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
    baseUsd = (tier.m[keys[0]] / rate(src.cur)) / (src.ppp || 1);
  }

  if (baseUsd === 0) return out(0, true, 0);

  const localAmt = roundNice(baseUsd * region.ppp * rate(region.cur), region.cur);
  return out(localAmt / rate(region.cur), false, localAmt);
}

/* Carriers and ISPs only exist in their own market. Everything else is global. */
function availableHere(svc, regionCode) {
  const code = regionCode || currentRegion().code;
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

function marketTag(svc) {
  if (!svc.markets) return '';
  return ' <span class="est-tag">' + svc.markets.map(function (m) {
    return (REGION_BY_CODE[m] || {}).flag || m;
  }).join(' ') + '</span>';
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

/* ─────────────────────────────  billing cycles  ───────────────────────────── */

function monthlyUSD(sub) {
  const c = CYCLE_BY_ID[sub.cycle] || CYCLE_BY_ID.monthly;
  return (sub.amount / rate(sub.cur)) * c.perMonth;
}

/* Dates are handled entirely in local time. Going through toISOString() would
   convert local midnight to UTC and land on the previous day for every timezone
   at or ahead of Greenwich, so a renewal date drifts a day earlier each cycle. */
function ymd(d) {
  const pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (isNaN(d.getTime())) return null;
  /* new Date(2026, 12, 45) happily rolls over into the following year rather
     than failing, so reject anything that did not survive the round trip. */
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d;
}

function todayStr() { return ymd(new Date()); }

/* Adding a month to the 31st must not spill into the month after next.
   anchorDay keeps a 31st-of-the-month subscription on the 31st in the months
   that have one, rather than sliding to the 28th permanently. */
function addMonths(d, months, anchorDay) {
  const day = anchorDay || d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastOfMonth));
}

function addCycle(dateStr, cycle, anchorDay) {
  const d = parseYmd(dateStr);
  if (!d) return dateStr;
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'fourweekly') d.setDate(d.getDate() + 28);
  else if (cycle === 'monthly') addMonths(d, 1, anchorDay);
  else if (cycle === 'quarterly') addMonths(d, 3, anchorDay);
  else if (cycle === 'semiannual') addMonths(d, 6, anchorDay);
  else addMonths(d, 12, anchorDay);
  return ymd(d);
}

function daysUntil(dateStr) {
  const then = parseYmd(dateStr);
  if (!then) return null;
  const now = parseYmd(todayStr());
  return Math.round((then - now) / 86400000);
}

/* roll a stale renewal date forward so "coming up" stays meaningful */
function normalisedNext(sub) {
  if (!sub.nextDate) return null;
  const start = parseYmd(sub.nextDate);
  if (!start) return null;
  const anchorDay = start.getDate();
  let d = sub.nextDate;
  let guard = 0;
  /* generous enough to catch a weekly subscription abandoned for twenty years */
  while (daysUntil(d) < 0 && guard++ < 1200) d = addCycle(d, sub.cycle, anchorDay);
  return d;
}

function fmtDate(dateStr) {
  const d = parseYmd(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─────────────────────────────  exchange rates  ───────────────────────────── */

function fxAgeHours() {
  if (!state.fx || !state.fx.at) return Infinity;
  return (Date.now() - state.fx.at) / 3600000;
}

function refreshFx(manual) {
  if (!navigator.onLine) {
    if (manual) toast('Offline — using the built-in rate table.');
    renderFxInfo();
    return Promise.resolve(false);
  }
  return fetch('https://open.er-api.com/v6/latest/USD')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.rates) throw new Error('bad payload');
      const keep = {};
      Object.keys(CURRENCIES).forEach(function (c) {
        if (typeof data.rates[c] === 'number') keep[c] = data.rates[c];
      });
      state.fx = { rates: keep, at: Date.now() };
      saveState();
      renderAll();
      if (manual) toast('Exchange rates updated.');
      return true;
    })
    .catch(function () {
      if (manual) toast('Rate service unreachable — using the built-in table.');
      renderFxInfo();
      return false;
    });
}

function renderFxInfo() {
  const el = $('#fxInfo');
  if (!el) return;
  if (state.fx && state.fx.at) {
    const h = fxAgeHours();
    const when = h < 1 ? 'less than an hour ago' : h < 48 ? Math.round(h) + ' hours ago' : Math.round(h / 24) + ' days ago';
    el.innerHTML = 'Live rates fetched ' + esc(when) + ' from open.er-api.com. ' +
      Object.keys(state.fx.rates).length + ' currencies cached in this browser.';
  } else {
    el.textContent = 'Using the built-in rate table. Rates are approximate and only affect the display currency, never a market\'s list price.';
  }
}

/* ─────────────────────────────  theme  ───────────────────────────── */

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const btn = $('#themeBtn');
  btn.textContent = state.theme === 'dark' ? '☾' : state.theme === 'light' ? '☀' : '◐';
  btn.title = 'Theme: ' + state.theme + ' — click to change';
}

/* ─────────────────────────────  selects  ───────────────────────────── */

function buildSelects() {
  const rs = $('#regionSelect');
  rs.innerHTML = REGIONS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
    .map(function (r) {
      return '<option value="' + r.code + '">' + r.flag + '  ' + esc(r.name) + ' (' + r.cur + ')</option>';
    }).join('');
  rs.value = state.region;

  const cs = $('#currencySelect');
  cs.innerHTML = Object.keys(CURRENCIES).sort()
    .map(function (c) {
      return '<option value="' + c + '">' + c + ' — ' + esc(CURRENCIES[c].name) + '</option>';
    }).join('');
  cs.value = state.currency;
}

/* ─────────────────────────────  dashboard  ───────────────────────────── */

function activeSubs() { return state.subs.filter(function (s) { return s.active !== false; }); }

function renderTiles() {
  const subs = activeSubs();
  const perMonthUsd = subs.reduce(function (n, s) { return n + monthlyUSD(s); }, 0);
  const shown = perMonthUsd * rate(state.currency);

  const nexts = subs.map(function (s) { return { sub: s, date: normalisedNext(s) }; })
    .filter(function (x) { return x.date; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  const soonest = nexts[0];
  const paused = state.subs.length - subs.length;

  const biggest = subs.slice().sort(function (a, b) { return monthlyUSD(b) - monthlyUSD(a); })[0];

  $('#tiles').innerHTML = [
    tile('Per month', fmtMoney(shown, state.currency), subs.length + ' active' + (paused ? ' · ' + paused + ' paused' : '')),
    tile('Per year', fmtMoney(shown * 12, state.currency), 'All active subscriptions, annualised'),
    tile('Next payment', soonest ? fmtMoney((soonest.sub.amount / rate(soonest.sub.cur)) * rate(state.currency), state.currency) : '—',
      soonest ? esc(soonest.sub.name) + ' · ' + relDay(daysUntil(soonest.date)) : 'No renewal dates set'),
    tile('Largest line', biggest ? fmtMoney(monthlyUSD(biggest) * rate(state.currency), state.currency) : '—',
      biggest ? esc(biggest.name) + ' a month' : 'Nothing tracked')
  ].join('');

  $('#dashSub').textContent = subs.length
    ? subs.length + ' active subscription' + (subs.length === 1 ? '' : 's') + ' priced for ' +
      currentRegion().name + ', shown in ' + state.currency + '.'
    : 'Nothing tracked yet — add one from the catalogue, or create a custom entry.';
}

function tile(label, value, note) {
  return '<div class="tile"><div class="tile-label">' + esc(label) + '</div>' +
         '<div class="tile-value">' + value + '</div>' +
         '<div class="tile-note">' + note + '</div></div>';
}

function relDay(d) {
  if (d == null) return '';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 0) return Math.abs(d) + ' days ago';
  return 'in ' + d + ' days';
}

/* Monthly spend by category — one measure across categories, so one hue,
   horizontal bars sorted by size, every bar directly labelled. */
function renderChart() {
  const subs = activeSubs();
  const host = $('#chart');
  const tableHost = $('#chartTable');

  if (!subs.length) {
    host.innerHTML = '<p class="empty">Add a subscription to see where the money goes.</p>';
    tableHost.innerHTML = '';
    return;
  }

  const byCat = {};
  subs.forEach(function (s) {
    const cat = s.group && CATEGORY_BY_GROUP[s.group] ? CATEGORY_BY_GROUP[s.group] : null;
    const key = cat ? cat.name : 'Other';
    byCat[key] = (byCat[key] || 0) + monthlyUSD(s);
  });

  const rows = Object.keys(byCat).map(function (k) { return { name: k, usd: byCat[k] }; })
    .sort(function (a, b) { return b.usd - a.usd; });
  const max = rows[0].usd || 1;
  const rawTotal = rows.reduce(function (n, r) { return n + r.usd; }, 0);
  /* everything tracked could legitimately be free — never divide by that */
  const total = rawTotal || 1;

  host.innerHTML = rows.map(function (r) {
    const shown = r.usd * rate(state.currency);
    const pct = Math.round((r.usd / total) * 100);
    return '<div class="bar-row" title="' + esc(r.name) + ' — ' + esc(fmtMoney(shown, state.currency)) +
             (rawTotal ? ' a month, ' + pct + '% of the total' : ' a month') + '">' +
             '<div class="bar-name">' + esc(r.name) + '</div>' +
             '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(1.2, (r.usd / max) * 100) + '%"></div></div>' +
             '<div class="bar-val">' + esc(fmtMoney(shown, state.currency)) + '</div>' +
           '</div>';
  }).join('');

  tableHost.innerHTML = '<table><thead><tr><th>Category</th><th class="num">Per month</th>' +
    '<th class="num">Per year</th><th class="num">Share</th></tr></thead><tbody>' +
    rows.map(function (r) {
      const shown = r.usd * rate(state.currency);
      return '<tr><td>' + esc(r.name) + '</td>' +
             '<td class="num">' + esc(fmtMoney(shown, state.currency)) + '</td>' +
             '<td class="num">' + esc(fmtMoney(shown * 12, state.currency)) + '</td>' +
             '<td class="num">' + (rawTotal ? Math.round((r.usd / total) * 100) + '%' : '—') + '</td></tr>';
    }).join('') +
    '<tr><td><strong>Total</strong></td><td class="num"><strong>' +
      esc(fmtMoney(rawTotal * rate(state.currency), state.currency)) + '</strong></td>' +
    '<td class="num"><strong>' + esc(fmtMoney(rawTotal * 12 * rate(state.currency), state.currency)) +
    '</strong></td><td class="num">' + (rawTotal ? '100%' : '—') + '</td></tr></tbody></table>';
}

function renderRenewals() {
  const rows = activeSubs()
    .map(function (s) { return { sub: s, date: normalisedNext(s) }; })
    .filter(function (x) { return x.date; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
    .slice(0, 8);

  const host = $('#renewals');
  if (!rows.length) {
    host.innerHTML = '<li class="empty">No renewal dates set yet. Add one when you edit a subscription.</li>';
    return;
  }
  host.innerHTML = rows.map(function (x) {
    const d = daysUntil(x.date);
    const amt = (x.sub.amount / rate(x.sub.cur)) * rate(state.currency);
    return '<li><span class="dot" style="background:' + esc(x.sub.color || '#888') + '"></span>' +
           '<span>' + esc(x.sub.name) + '</span>' +
           '<span class="when' + (d <= 3 ? ' soon' : '') + '">' + esc(fmtMoney(amt, state.currency)) +
           ' · ' + esc(relDay(d)) + '</span></li>';
  }).join('');
}

let subFilter = 'active';

function renderSubList() {
  const host = $('#subList');
  let list = state.subs.slice();
  if (subFilter === 'active') list = list.filter(function (s) { return s.active !== false; });
  if (subFilter === 'paused') list = list.filter(function (s) { return s.active === false; });
  list.sort(function (a, b) { return monthlyUSD(b) - monthlyUSD(a); });

  if (!list.length) {
    host.innerHTML = '<p class="empty">Nothing here yet.</p>';
    return;
  }

  host.innerHTML = list.map(function (s) {
    const cyc = CYCLE_BY_ID[s.cycle] || CYCLE_BY_ID.monthly;
    const perMonth = monthlyUSD(s) * rate(state.currency);
    const charged = (s.amount / rate(s.cur)) * rate(state.currency);
    const next = normalisedNext(s);
    const grp = GROUP_BY_ID[s.group];
    return '<article class="sub-card' + (s.active === false ? ' paused' : '') + '" data-id="' + esc(s.id) + '">' +
      '<div class="sub-top">' +
        '<span class="dot" style="background:' + esc(s.color || '#888') + '"></span>' +
        '<div><div class="sub-name">' + esc(s.name) + '</div>' +
        '<div class="sub-tier">' + esc(s.tierName || 'Custom') + (grp ? ' · ' + esc(grp.name) : '') + '</div></div>' +
      '</div>' +
      '<div class="sub-price">' + esc(fmtMoney(charged, state.currency)) +
        '<span class="tier-cycle"> ' + esc(cyc.label.toLowerCase()) + '</span></div>' +
      '<div class="sub-meta">' + esc(fmtMoney(perMonth, state.currency)) + ' a month · ' +
        esc(fmtMoney(perMonth * 12, state.currency)) + ' a year' +
        (next ? ' · renews ' + esc(fmtDate(next)) : '') + '</div>' +
      (s.notes ? '<div class="sub-meta">' + esc(s.notes) + '</div>' : '') +
      '<div class="sub-actions">' +
        '<button class="btn btn-sm" data-act="edit">Edit</button>' +
        (s.serviceId ? '<button class="btn btn-sm" data-act="similar">Compare similar</button>' : '') +
        '<button class="btn btn-sm" data-act="toggle">' + (s.active === false ? 'Resume' : 'Pause') + '</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del">Remove</button>' +
      '</div></article>';
  }).join('');
}

/* ─────────────────────────────  catalogue  ───────────────────────────── */

let catFilter = 'all';
let searchTerm = '';

function matchesSearch(svc) {
  if (!searchTerm) return true;
  const q = searchTerm.toLowerCase();
  const cat = CATEGORY_BY_GROUP[svc.group];
  const grp = GROUP_BY_ID[svc.group];
  const hay = [svc.name, svc.company, svc.blurb, cat ? cat.name : '', grp ? grp.name : '',
               svc.tiers.map(function (t) { return t.name; }).join(' ')].join(' ').toLowerCase();
  return hay.indexOf(q) !== -1;
}

function renderChips() {
  $('#catChips').innerHTML =
    '<button class="chip' + (catFilter === 'all' ? ' is-active' : '') + '" data-cat="all" aria-pressed="' + (catFilter === 'all') + '">All categories</button>' +
    CATEGORIES.map(function (c) {
      return '<button class="chip' + (catFilter === c.id ? ' is-active' : '') + '" data-cat="' + c.id +
             '" aria-pressed="' + (catFilter === c.id) + '">' +
             c.icon + '&nbsp; ' + esc(c.name) + '</button>';
    }).join('');
}

function renderCatalog() {
  const host = $('#catalogList');
  const region = REGION_BY_CODE[state.region] || REGION_BY_CODE.US;
  $('#browseRegionName').textContent = region.flag + ' ' + region.name;
  $('#catalogCount').textContent = CATALOG.length;

  const blocks = [];
  let shownCount = 0;

  CATEGORIES.forEach(function (cat) {
    if (catFilter !== 'all' && catFilter !== cat.id) return;

    const groupHtml = [];
    let catCount = 0;

    cat.groups.forEach(function (grp) {
      const all = CATALOG.filter(function (s) { return s.group === grp.id && matchesSearch(s); });
      const svcs = all.filter(function (s) { return availableHere(s); });
      const hidden = all.length - svcs.length;
      if (!svcs.length && !hidden) return;
      catCount += svcs.length;

      /* sorted by company, then by service name inside each company */
      const byCompany = {};
      svcs.forEach(function (s) { (byCompany[s.company] = byCompany[s.company] || []).push(s); });
      const companies = Object.keys(byCompany).sort(function (a, b) { return a.localeCompare(b); });

      const hiddenNote = hidden
        ? '<p class="muted" style="margin:-2px 0 10px">' + hidden + ' provider' + (hidden === 1 ? '' : 's') +
          ' hidden — not sold in ' + esc(currentRegion().name) +
          '. Carriers and broadband providers are national; switch market to see others.</p>'
        : '';

      groupHtml.push(
        '<div class="group-block"><div class="group-head">' + esc(grp.name) + '</div>' + hiddenNote +
        '<div class="company-cols">' +
        companies.map(function (co) {
          const cards = byCompany[co].sort(function (a, b) { return a.name.localeCompare(b.name); })
            .map(serviceCard).join('');
          return '<div class="company-block"><div class="company-head">' + esc(co) + '</div>' +
                 '<div class="svc-grid">' + cards + '</div></div>';
        }).join('') +
        '</div></div>'
      );
    });

    if (!groupHtml.length) return;
    shownCount += catCount;
    blocks.push(
      '<section class="cat-block"><div class="cat-head"><span>' + cat.icon + '</span><h2>' + esc(cat.name) + '</h2>' +
      '<span class="cat-count">' + catCount + ' service' + (catCount === 1 ? '' : 's') + '</span></div>' +
      groupHtml.join('') + '</section>'
    );
  });

  host.innerHTML = shownCount ? blocks.join('')
    : '<p class="empty">Nothing matches “' + esc(searchTerm) + '”. Try a company name, or create a custom subscription.</p>';
}

function serviceCard(svc) {
  const cheap = cheapestPaidTier(svc, state.region);
  const free = svc.tiers.some(function (t) {
    const p = tierPrice(t, state.region);
    return p && p.usd === 0;
  });
  let from = '<span class="na">not sold in this market</span>';
  if (cheap) {
    const shown = cheap.usd * rate(state.currency);   /* already monthly-equivalent */
    from = 'From <strong>' + esc(fmtMoney(shown, state.currency)) + '</strong><span class="tier-cycle">/mo</span>' +
      (cheap.price.exact ? '' : ' <span class="est-tag">est.</span>') +
      '<span class="tier-cycle"> · ' + esc(cheap.tier.name) + '</span>' +
      (free ? '<span class="tier-cycle"> · free tier too</span>' : '');
  } else if (free) {
    from = '<strong>Free</strong> tier only';
  }

  return '<article class="svc-card" data-svc="' + esc(svc.id) + '">' +
    '<div class="svc-top">' +
      '<span class="svc-logo" aria-hidden="true" style="background:' + esc(svc.color) + '">' + esc(initials(svc.name)) + '</span>' +
      '<div><div class="svc-name">' + esc(svc.name) + '</div>' +
      '<div class="svc-company">' + esc(svc.company) + ' · <span class="tier-count">' + svc.tiers.length +
      ' tier' + (svc.tiers.length === 1 ? '' : 's') + '</span></div></div>' +
    '</div>' +
    '<p class="svc-blurb">' + esc(svc.blurb) + '</p>' +
    '<div class="svc-from">' + from + '</div>' +
    '<div class="svc-actions">' +
      '<button class="btn btn-sm btn-primary" data-act="add">Add</button>' +
      '<button class="btn btn-sm" data-act="tiers">All tiers</button>' +
      '<button class="btn btn-sm" data-act="similar">Compare to similar</button>' +
    '</div></article>';
}

/* ─────────────────────────────  tier rendering  ───────────────────────────── */

function tierCards(svc, opts) {
  const o = opts || {};
  const cheap = cheapestPaidTier(svc, state.region);
  return '<div class="tier-grid">' + svc.tiers.map(function (t) {
    const p = tierPrice(t, state.region);
    const isCheapest = cheap && cheap.tier === t && o.markCheapest !== false;
    let priceHtml;
    if (!p) {
      priceHtml = '<div class="tier-price"><span class="na">not sold here</span></div>';
    } else if (p.usd === 0) {
      priceHtml = '<div class="tier-price">Free</div>';
    } else {
      const shown = p.usd * rate(state.currency);
      const periodic = p.cycle.id !== 'monthly' && !t.billedYearly;
      priceHtml = '<div class="tier-price">' + esc(fmtMoney(shown, state.currency)) +
        '<span class="tier-cycle">' + (periodic ? ' per ' + (p.cycle.id === 'fourweekly' ? '28 days' : p.cycle.label.toLowerCase()) : '/mo') +
        (t.billedYearly ? ', billed yearly' : '') + '</span></div>';
      const native = p.local.cur !== state.currency
        ? '<div class="tier-native">' + esc(fmtMoney(p.local.amount, p.local.cur)) + ' in ' + esc(p.local.cur) + '</div>' : '';
      const equiv = periodic
        ? '<div class="tier-native">' + esc(fmtMoney(p.monthlyUsd * rate(state.currency), state.currency)) +
          ' a month equivalent — ' + Math.round(p.cycle.perMonth * 12) + ' payments a year</div>' : '';
      const yearly = t.y && t.y[state.region] != null
        ? '<div class="tier-native">' + esc(fmtMoney((t.y[state.region] / rate(currentRegion().cur)) * rate(state.currency), state.currency)) + ' charged once a year</div>'
        : '<div class="tier-native">' + esc(fmtMoney(p.monthlyUsd * 12 * rate(state.currency), state.currency)) + ' a year</div>';
      priceHtml += native + equiv + yearly;
      if (!p.exact) priceHtml += '<div class="tier-native"><span class="est-tag">est.</span> not a published local price</div>';
    }
    return '<div class="tier-card' + (isCheapest ? ' is-cheapest' : '') + '">' +
      '<div class="tier-name">' + esc(t.name) +
        (isCheapest ? ' <span class="badge badge-good">cheapest paid</span>' : '') +
        (t.addon ? ' <span class="est-tag">add-on</span>' : '') +
        (t.only && !t.inheritedOnly ? ' <span class="est-tag">' + esc(t.only.join('/')) + ' only</span>' : '') + '</div>' +
      priceHtml +
      '<ul class="benefits">' + t.benefits.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      (o.addable ? '<button class="btn btn-sm" data-add-tier="' + esc(t.name) + '" data-svc="' + esc(svc.id) + '">Track this tier</button>' : '') +
      '</div>';
  }).join('') + '</div>';
}

/* ─────────────────────────────  compare  ───────────────────────────── */

function renderCompare() {
  const host = $('#compareOut');
  const pills = $('#comparePills');

  pills.innerHTML = state.compare.map(function (id) {
    const s = SERVICE_BY_ID[id];
    if (!s) return '';
    return '<span class="pill"><span class="dot" style="background:' + esc(s.color) + '"></span>' +
           esc(s.name) + '<button data-drop="' + esc(id) + '" aria-label="Remove ' + esc(s.name) + ' from comparison">✕</button></span>';
  }).join('');

  if (!state.compare.length) {
    host.innerHTML = '<p class="empty">Nothing selected. Search above, or press “Compare to similar” on any service in the catalogue.</p>';
    return;
  }

  const svcs = state.compare.map(function (id) { return SERVICE_BY_ID[id]; }).filter(Boolean);

  /* headline row: cheapest paid entry point for each service, side by side */
  const summary = svcs.map(function (s) {
    const c = cheapestPaidTier(s, state.region);
    return { svc: s, usd: c ? c.usd : null, tier: c ? c.tier : null, exact: c ? c.price.exact : true };
  }).sort(function (a, b) {
    if (a.usd == null) return 1;
    if (b.usd == null) return -1;
    return a.usd - b.usd;
  });

  const summaryTable =
    '<section class="card"><div class="card-head"><h2>Cheapest way in, ' +
      esc(currentRegion().name) + '</h2></div><div class="table-wrap"><table>' +
    '<thead><tr><th>Service</th><th>Company</th><th>Entry tier</th><th class="num">Per month</th>' +
    '<th class="num">Per year</th><th class="num">Tiers</th></tr></thead><tbody>' +
    summary.map(function (r) {
      if (r.usd == null) {
        return '<tr><td>' + esc(r.svc.name) + '</td><td>' + esc(r.svc.company) +
               '</td><td colspan="4" class="na">not sold in this market</td></tr>';
      }
      const shown = r.usd * rate(state.currency);
      return '<tr><td><span class="dot" style="display:inline-block;background:' + esc(r.svc.color) + '"></span> ' +
        esc(r.svc.name) + '</td><td>' + esc(r.svc.company) + '</td><td>' + esc(r.tier.name) + '</td>' +
        '<td class="num">' + esc(fmtMoney(shown, state.currency)) + (r.exact ? '' : ' <span class="est-tag">est.</span>') + '</td>' +
        '<td class="num">' + esc(fmtMoney(shown * 12, state.currency)) + '</td>' +
        '<td class="num">' + r.svc.tiers.length + '</td></tr>';
    }).join('') + '</tbody></table></div></section>';

  const detail = svcs.map(function (s) {
    const grp = GROUP_BY_ID[s.group];
    return '<section class="cmp-svc"><div class="cmp-svc-head">' +
      '<span class="svc-logo" aria-hidden="true" style="background:' + esc(s.color) + '">' + esc(initials(s.name)) + '</span>' +
      '<div><h2>' + esc(s.name) + marketTag(s) + '</h2><div class="svc-company">' + esc(s.company) +
      (grp ? ' · ' + esc(grp.name) : '') + ' · <a href="https://' + esc(s.site) + '" target="_blank" rel="noopener">' + esc(s.site) + '</a></div></div>' +
      '<button class="btn btn-sm" style="margin-left:auto" data-cmp-add="' + esc(s.id) + '">Track a tier</button></div>' +
      '<p class="svc-blurb">' + esc(s.blurb) + '</p>' +
      tierCards(s) + '</section>';
  }).join('');

  host.innerHTML = summaryTable + detail;
}

function compareSimilar(svcId) {
  const svc = SERVICE_BY_ID[svcId];
  if (!svc) return;
  const peers = CATALOG.filter(function (s) { return s.group === svc.group && availableHere(s); })
    .sort(function (a, b) {
      if (a.id === svc.id) return -1;
      if (b.id === svc.id) return 1;
      return a.company.localeCompare(b.company);
    })
    .slice(0, 8)
    .map(function (s) { return s.id; });
  state.compare = peers;
  saveState();
  switchTab('compare');
  renderCompare();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('Comparing ' + peers.length + ' services in ' + GROUP_BY_ID[svc.group].name + '.');
}

/* ─────────────────────────────  modal  ───────────────────────────── */

let modalReturnFocus = null;

function openModal(title, bodyHtml, wide) {
  if ($('#modal').hidden) modalReturnFocus = document.activeElement;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modal').firstElementChild.classList.toggle('wide', !!wide);
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#modalClose').focus();
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modalBody').innerHTML = '';
  document.body.style.overflow = '';
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function openTiers(svcId) {
  const svc = SERVICE_BY_ID[svcId];
  if (!svc) return;
  openModal(svc.name + ' — every tier',
    '<p class="sub" style="margin-bottom:14px">' + esc(svc.company) + ' · priced for ' +
      esc(currentRegion().name) + ', shown in ' + esc(state.currency) +
      ' · <a href="https://' + esc(svc.site) + '" target="_blank" rel="noopener">' + esc(svc.site) + '</a></p>' +
    tierCards(svc, { addable: true }) +
    '<div class="modal-foot"><button class="btn" data-close>Close</button>' +
    '<button class="btn btn-primary" data-similar="' + esc(svc.id) + '">Compare to similar services</button></div>', true);
}

/* ── add / edit form ── */

function openSubForm(sub, presetSvcId, presetTierName) {
  const editing = !!sub;
  const svc = presetSvcId ? SERVICE_BY_ID[presetSvcId] : (sub && sub.serviceId ? SERVICE_BY_ID[sub.serviceId] : null);
  const region = currentRegion();

  let draft;
  if (editing) {
    draft = Object.assign({}, sub);
  } else if (svc) {
    const tier = presetTierName
      ? svc.tiers.filter(function (t) { return t.name === presetTierName; })[0]
      : (cheapestPaidTier(svc, state.region) || {}).tier || svc.tiers[0];
    const p = tierPrice(tier, state.region);
    draft = {
      id: uid(), serviceId: svc.id, tierName: tier.name, name: svc.name, company: svc.company,
      group: svc.group, color: svc.color,
      amount: p ? p.local.amount : 0, cur: region.cur,
      cycle: tier.billedYearly ? 'yearly' : (tier.cycle || 'monthly'),
      nextDate: '', notes: '', active: true,
      benefits: tier.benefits.slice()
    };
    if (tier.billedYearly && tier.y && tier.y[state.region] != null) draft.amount = tier.y[state.region];
    else if (tier.billedYearly && p) draft.amount = roundNice(p.local.amount * 12, region.cur);
  } else {
    draft = {
      id: uid(), serviceId: null, tierName: '', name: '', company: '', group: '', color: '#2a78d6',
      amount: 0, cur: region.cur, cycle: 'monthly', nextDate: '', notes: '', active: true, benefits: []
    };
  }

  const tierPickerHtml = svc ? (
    '<div class="field"><label id="tierPickerLabel">Tier</label>' +
    '<div class="tier-picker" id="tierPicker" role="group" aria-labelledby="tierPickerLabel">' +
    svc.tiers.map(function (t) {
      const p = tierPrice(t, state.region);
      const unit = t.billedYearly ? '/mo, billed yearly'
        : (p && p.cycle.id === 'fourweekly') ? ' per 28 days'
        : (p && p.cycle.id !== 'monthly') ? ' ' + p.cycle.label.toLowerCase()
        : '/mo';
      const label = !p ? '<span class="na">not sold here</span>'
        : p.usd === 0 ? 'Free'
        : esc(fmtMoney(p.local.amount, p.local.cur)) + unit + (p.exact ? '' : ' <span class="est-tag">est.</span>');
      return '<button type="button" class="tier-pick' + (t.name === draft.tierName ? ' is-sel' : '') +
        '" data-tier="' + esc(t.name) + '" aria-pressed="' + (t.name === draft.tierName) + '">' +
        '<div class="tier-pick-top"><strong>' + esc(t.name) + '</strong><span>' + label + '</span></div>' +
        '<div class="field-hint">' + esc(t.benefits.slice(0, 2).join(' · ')) + '</div></button>';
    }).join('') + '</div></div>'
  ) : '';

  const groupOptions = '<option value="">— none —</option>' + CATEGORIES.map(function (c) {
    return '<optgroup label="' + esc(c.name) + '">' + c.groups.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === draft.group ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    }).join('') + '</optgroup>';
  }).join('');

  const body =
    '<form id="subForm">' +
    (svc ? '<p class="sub" style="margin-bottom:14px"><span class="dot" style="display:inline-block;background:' +
      esc(svc.color) + '"></span> ' + esc(svc.company) + ' · prices for ' + esc(region.flag + ' ' + region.name) + '</p>' : '') +
    tierPickerHtml +
    '<div class="field-row">' +
      '<div class="field"><label for="fName">Name</label><input id="fName" type="text" required value="' + esc(draft.name) + '"></div>' +
      '<div class="field"><label for="fCompany">Company</label><input id="fCompany" type="text" value="' + esc(draft.company) + '"></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fAmount">Amount you actually pay</label>' +
        '<input id="fAmount" type="number" min="0" step="0.01" required value="' + esc(draft.amount) + '">' +
        '<span class="field-hint">Override the catalogue price with your real charge — promos, bundles and tax included.</span></div>' +
      '<div class="field"><label for="fCur">Currency</label><select id="fCur">' +
        Object.keys(CURRENCIES).sort().map(function (c) {
          return '<option value="' + c + '"' + (c === draft.cur ? ' selected' : '') + '>' + c + ' — ' + esc(CURRENCIES[c].name) + '</option>';
        }).join('') + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fCycle">Billing cycle</label><select id="fCycle">' +
        CYCLES.map(function (c) {
          return '<option value="' + c.id + '"' + (c.id === draft.cycle ? ' selected' : '') + '>' + esc(c.label) + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label for="fNext">Next payment</label><input id="fNext" type="date" value="' + esc(draft.nextDate || '') + '">' +
        '<span class="field-hint">Optional — drives the “coming up” list.</span></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fGroup">Category</label><select id="fGroup">' + groupOptions + '</select></div>' +
      '<div class="field"><label for="fColor">Colour</label><input id="fColor" type="color" value="' +
        esc(/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#2a78d6') + '" style="height:36px;padding:2px"></div>' +
    '</div>' +
    '<div class="field"><label for="fNotes">Note</label><input id="fNotes" type="text" value="' + esc(draft.notes || '') +
      '" placeholder="Shared with family, cancel before renewal, …"></div>' +
    '<div class="modal-foot">' +
      '<button type="button" class="btn" data-close>Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (editing ? 'Save changes' : 'Add subscription') + '</button>' +
    '</div></form>';

  openModal(editing ? 'Edit ' + draft.name : svc ? 'Track ' + svc.name : 'Custom subscription', body);

  const form = $('#subForm');

  if (svc) {
    $$('#tierPicker .tier-pick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tier = svc.tiers.filter(function (t) { return t.name === btn.dataset.tier; })[0];
        if (!tier) return;
        $$('#tierPicker .tier-pick').forEach(function (b) {
          b.classList.toggle('is-sel', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        draft.tierName = tier.name;
        draft.benefits = tier.benefits.slice();
        const p = tierPrice(tier, state.region);
        if (p) {
          if (tier.billedYearly) {
            $('#fCycle').value = 'yearly';
            $('#fAmount').value = tier.y && tier.y[state.region] != null
              ? tier.y[state.region] : roundNice(p.local.amount * 12, p.local.cur);
          } else {
            $('#fCycle').value = tier.cycle || 'monthly';
            $('#fAmount').value = p.local.amount;
          }
          $('#fCur').value = p.local.cur;
        }
      });
    });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const rec = {
      id: draft.id,
      serviceId: draft.serviceId,
      tierName: draft.tierName,
      name: $('#fName').value.trim() || 'Untitled',
      company: $('#fCompany').value.trim(),
      group: $('#fGroup').value,
      color: $('#fColor').value,
      amount: parseFloat($('#fAmount').value) || 0,
      cur: $('#fCur').value,
      cycle: $('#fCycle').value,
      nextDate: $('#fNext').value,
      notes: $('#fNotes').value.trim(),
      active: draft.active !== false,
      benefits: draft.benefits || []
    };
    const i = state.subs.findIndex(function (s) { return s.id === rec.id; });
    if (i >= 0) state.subs[i] = rec; else state.subs.push(rec);
    saveState();
    closeModal();
    switchTab('dashboard');
    renderAll();
    toast(i >= 0 ? 'Saved.' : rec.name + ' added.');
  });
}

/* ─────────────────────────────  picker for “+ Add”  ───────────────────────────── */

function openCatalogPicker() {
  switchTab('browse');
  $('#search').focus();
  toast('Pick a service below, or press Custom for something not listed.');
}

/* ─────────────────────────────  tabs  ───────────────────────────── */

function switchTab(name) {
  $$('.tab').forEach(function (t) {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$('.panel').forEach(function (p) { p.classList.toggle('is-active', p.id === 'panel-' + name); });
}

/* ─────────────────────────────  render all  ───────────────────────────── */

function renderAll() {
  renderTiles();
  renderChart();
  renderRenewals();
  renderSubList();
  renderChips();
  renderCatalog();
  renderCompare();
  renderFxInfo();
  renderStorageInfo();
}

function renderStorageInfo() {
  const el = $('#storageInfo');
  if (!el) return;
  let bytes = 0;
  try { bytes = (localStorage.getItem(KEY) || '').length; } catch (e) { /* storage blocked */ }
  el.textContent = state.subs.length + ' subscription' + (state.subs.length === 1 ? '' : 's') +
    ' saved in this browser (' + (bytes ? (bytes / 1024).toFixed(1) + ' KB' : 'not yet written') +
    '). Clearing site data or using a private window will lose it — export a copy if it matters.';
}

/* ─────────────────────────────  events  ───────────────────────────── */

function wire() {
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchTab(t.dataset.tab); });
  });
  $('.tabs').addEventListener('keydown', function (e) {
    const tabs = $$('.tab');
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next === -1) return;
    e.preventDefault();
    switchTab(tabs[next].dataset.tab);
    tabs[next].focus();
  });

  $('#regionSelect').addEventListener('change', function (e) {
    const r = REGION_BY_CODE[e.target.value];
    if (!r) return;
    state.region = r.code;
    state.currency = r.cur;
    $('#currencySelect').value = r.cur;
    saveState(); renderAll();
    toast('Prices now quoted for ' + r.name + '.');
  });

  $('#currencySelect').addEventListener('change', function (e) {
    state.currency = e.target.value; saveState(); renderAll();
  });

  $('#themeBtn').addEventListener('click', function () {
    state.theme = state.theme === 'auto' ? 'light' : state.theme === 'light' ? 'dark' : 'auto';
    applyTheme(); saveState();
  });

  $('#addFromCatalogBtn').addEventListener('click', openCatalogPicker);
  $('#addCustomBtn').addEventListener('click', function () { openSubForm(null, null, null); });

  $('#search').addEventListener('input', function (e) { searchTerm = e.target.value.trim(); renderCatalog(); });

  $('#catChips').addEventListener('click', function (e) {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    catFilter = chip.dataset.cat;
    renderChips(); renderCatalog();
  });

  $('#catalogList').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.svc-card').dataset.svc;
    if (btn.dataset.act === 'add') openSubForm(null, id, null);
    else if (btn.dataset.act === 'tiers') openTiers(id);
    else if (btn.dataset.act === 'similar') compareSimilar(id);
  });

  $('#subList').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.sub-card').dataset.id;
    const sub = state.subs.filter(function (s) { return s.id === id; })[0];
    if (!sub) return;
    if (btn.dataset.act === 'edit') openSubForm(sub);
    else if (btn.dataset.act === 'similar') compareSimilar(sub.serviceId);
    else if (btn.dataset.act === 'toggle') { sub.active = sub.active === false; saveState(); renderAll(); }
    else if (btn.dataset.act === 'del') {
      if (confirm('Remove ' + sub.name + ' from your tracked subscriptions?')) {
        state.subs = state.subs.filter(function (s) { return s.id !== id; });
        saveState(); renderAll(); toast('Removed.');
      }
    }
  });

  $('#subFilter').addEventListener('click', function (e) {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    subFilter = b.dataset.filter;
    $$('#subFilter .seg-btn').forEach(function (x) {
      x.classList.toggle('is-active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    renderSubList();
  });

  $('#tableToggle').addEventListener('click', function () {
    const t = $('#chartTable');
    t.hidden = !t.hidden;
    this.textContent = t.hidden ? 'Show as table' : 'Hide table';
    this.setAttribute('aria-expanded', String(!t.hidden));
  });

  /* modal delegation */
  $('#modal').addEventListener('click', function (e) {
    if (e.target === this) return closeModal();
    if (e.target.closest('[data-close]')) return closeModal();
    const sim = e.target.closest('[data-similar]');
    if (sim) { closeModal(); return compareSimilar(sim.dataset.similar); }
    const addTier = e.target.closest('[data-add-tier]');
    if (addTier) { openSubForm(null, addTier.dataset.svc, addTier.dataset.addTier); }
  });
  $('#modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if ($('#modal').hidden) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'Tab') {
      /* keep keyboard focus inside the open dialog */
      const f = $$('#modal button, #modal a[href], #modal input, #modal select, #modal textarea')
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !$('#modal').contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !$('#modal').contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  });

  /* compare panel */
  $('#comparePills').addEventListener('click', function (e) {
    const b = e.target.closest('[data-drop]');
    if (!b) return;
    state.compare = state.compare.filter(function (x) { return x !== b.dataset.drop; });
    saveState(); renderCompare();
  });

  $('#compareOut').addEventListener('click', function (e) {
    const b = e.target.closest('[data-cmp-add]');
    if (b) openSubForm(null, b.dataset.cmpAdd, null);
  });

  $('#clearCompare').addEventListener('click', function () {
    state.compare = []; saveState(); renderCompare();
  });

  const cs = $('#compareSearch');
  cs.addEventListener('input', function () {
    const q = cs.value.trim().toLowerCase();
    const box = $('#compareSuggest');
    if (!q) { box.hidden = true; return; }
    const hits = CATALOG.filter(function (s) {
      return state.compare.indexOf(s.id) === -1 &&
        (s.name.toLowerCase().indexOf(q) !== -1 || s.company.toLowerCase().indexOf(q) !== -1);
    }).slice(0, 12);
    if (!hits.length) { box.hidden = true; return; }
    box.innerHTML = hits.map(function (s) {
      return '<button type="button" data-pick="' + esc(s.id) + '">' +
        '<span class="svc-logo" aria-hidden="true" style="width:22px;height:22px;font-size:.625rem;background:' + esc(s.color) + '">' +
        esc(initials(s.name)) + '</span><span>' + esc(s.name) + marketTag(s) + '</span>' +
        '<span class="muted" style="margin-left:auto">' + esc(s.company) + '</span></button>';
    }).join('');
    box.hidden = false;
  });
  $('#compareSuggest').addEventListener('click', function (e) {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    if (state.compare.indexOf(b.dataset.pick) === -1) state.compare.push(b.dataset.pick);
    cs.value = ''; this.hidden = true;
    saveState(); renderCompare();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#compareSearch') && !e.target.closest('#compareSuggest')) $('#compareSuggest').hidden = true;
  });

  /* data panel */
  $('#exportBtn').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), state: state }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'subtrackr-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        const incoming = data.state || data;
        if (!incoming || !Array.isArray(incoming.subs)) throw new Error('no subscriptions in file');
        Object.assign(state, sanitise({
          region: incoming.region || state.region,
          currency: incoming.currency || state.currency,
          theme: incoming.theme || state.theme,
          subs: incoming.subs,
          compare: Array.isArray(incoming.compare) ? incoming.compare : []
        }));
        saveState(); buildSelects(); applyTheme(); renderAll();
        toast('Imported ' + state.subs.length + ' subscriptions.');
      } catch (err) {
        toast('That file could not be read as a Subtrackr export.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  $('#wipeBtn').addEventListener('click', function () {
    if (!confirm('Erase every tracked subscription and setting from this browser? This cannot be undone.')) return;
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    Object.assign(state, freshState());
    buildSelects(); applyTheme(); renderAll();
    toast('Everything erased.');
  });

  $('#fxRefresh').addEventListener('click', function () { refreshFx(true); });
}

/* ─────────────────────────────  boot  ───────────────────────────── */

state = loadState();

buildSelects();
applyTheme();
wire();
renderAll();
if (fxAgeHours() > 12) refreshFx(false);

})();
