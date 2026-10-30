/* csv.js — turn a bank or card statement export into expenses.
 *
 * Statements disagree on everything: delimiter, date order, whether spending
 * is positive or negative, one amount column or separate debit and credit
 * columns. parse → guessMapping → toExpenses handles the common shapes, and
 * the mapping the user confirms is saved per header so the next import from
 * the same bank needs no questions.
 */

(function (ST) {
'use strict';

const D = ST.dates, U = ST.util;

/* RFC 4180-ish: quoted fields, doubled quotes, CRLF, a BOM, and ; or tab
   delimiters when the header suggests them */
function parse(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && counts[ch] != null) counts[ch]++; }
  const delim = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];

  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
  return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
}

/* ── amounts ── */

/* "$1,234.56", "(12.00)", "-12.00", "12.00 CR", "1.234,56", "₹ 1,23,456" → number */
function parseAmount(s) {
  /* a typographic minus (−) or dash counts as a minus sign */
  let t = String(s == null ? '' : s).trim().replace(/[\u2212\u2013\u2014]/g, '-');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bCR\b/i.test(t)) { neg = !neg; t = t.replace(/\bCR\b/i, ''); }
  t = t.replace(/\bDR\b/i, '');
  if (/^-|-$/.test(t.replace(/[^0-9.,\-]/g, ''))) neg = !neg;
  t = t.replace(/[^0-9.,]/g, '');
  if (!t) return null;
  /* decide which separator is the decimal: the last one, if followed by 1–2 digits */
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  const decPos = Math.max(lastDot, lastComma);
  if (decPos >= 0 && t.length - decPos - 1 <= 2 && t.length - decPos - 1 > 0) {
    t = t.slice(0, decPos).replace(/[.,]/g, '') + '.' + t.slice(decPos + 1);
  } else {
    t = t.replace(/[.,]/g, '');
  }
  const n = Number(t);
  return isFinite(n) ? (neg ? -n : n) : null;
}

/* ── dates ── */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function pad(n) { return (n < 10 ? '0' : '') + n; }

/* order: 'auto' | 'mdy' | 'dmy' | 'ymd' → 'YYYY-MM-DD' or null */
function parseDate(s, order) {
  const t = String(s || '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[ -]([A-Za-z]{3,4})[a-z]*[ -,]*(\d{2,4})/.exec(t);
  if (m && MONTHS[m[2].toLowerCase()]) return valid(year(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  m = /^([A-Za-z]{3,4})[a-z]* (\d{1,2}),? (\d{4})/.exec(t);
  if (m && MONTHS[m[1].toLowerCase()]) return valid(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
  if (m) {
    const a = +m[1], b = +m[2], y = year(+m[3]);
    if (order === 'dmy' || (order !== 'mdy' && a > 12)) return valid(y, b, a);
    return valid(y, a, b);
  }
  return null;
}
function year(y) { return y < 100 ? 2000 + y : y; }
function valid(y, mo, d) { const s = y + '-' + pad(mo) + '-' + pad(d); return D.parseYmd(s) ? s : null; }

/* pick the day/month order from the data itself, falling back to the market's habit */
function detectOrder(values, region) {
  let mdy = false, dmy = false;
  values.forEach(function (v) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(String(v).trim());
    if (!m) return;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  });
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return region === 'US' ? 'mdy' : 'dmy';
}

/* ── mapping ── */

function find(header, patterns) {
  const h = header.map(function (x) { return x.toLowerCase(); });
  for (const p of patterns) {
    const i = h.findIndex(function (x) { return p.test(x); });
    if (i >= 0) return i;
  }
  return -1;
}

/* → { date, amount, debit, credit, merchant, category, order, flip, hasHeader } (column indexes, -1 when absent) */
function guessMapping(rows, region) {
  const header = rows[0] || [];
  const hasHeader = header.some(function (c) { return /[a-z]/i.test(c) && parseAmount(c) == null && !parseDate(c); });
  const body = hasHeader ? rows.slice(1) : rows;
  const cols = header.length;
  let map = {
    date: find(header, [/^(transaction |trans\.? |posting |posted |value )?date$/, /date/]),
    amount: find(header, [/^amount$/, /amount/, /^value$/, /sum/]),
    debit: find(header, [/debit|withdrawal|money out|paid out|spent/]),
    credit: find(header, [/credit|deposit|money in|paid in/]),
    merchant: find(header, [/merchant|payee|description|narration|details|name|memo|particulars/]),
    category: find(header, [/categor/])
  };
  if (!hasHeader) map = { date: -1, amount: -1, debit: -1, credit: -1, merchant: -1, category: -1 };
  /* fill gaps by sniffing the data */
  const sample = body.slice(0, 20);
  function colScore(i, test) { return sample.filter(function (r) { return test(r[i]); }).length; }
  for (let i = 0; i < cols; i++) {
    if (map.date < 0 && colScore(i, function (v) { return parseDate(v, 'auto'); }) > sample.length * 0.6) map.date = i;
  }
  if (map.amount < 0 && map.debit < 0) {
    for (let i = 0; i < cols; i++) {
      if (i !== map.date && colScore(i, function (v) { return /\d/.test(v || '') && parseAmount(v) != null && !parseDate(v); }) > sample.length * 0.6) { map.amount = i; break; }
    }
  }
  if (map.merchant < 0) {
    let best = -1, bestLen = 0;
    for (let i = 0; i < cols; i++) {
      if (i === map.date || i === map.amount) continue;
      const len = U.sum(sample, function (r) { return /[a-z]/i.test(r[i] || '') ? (r[i] || '').length : 0; });
      if (len > bestLen) { best = i; bestLen = len; }
    }
    map.merchant = best;
  }
  /* separate debit/credit columns win over a single amount when both exist */
  if (map.debit >= 0 && map.amount === map.debit) map.amount = -1;
  map.order = detectOrder(body.map(function (r) { return r[map.date]; }), region);
  /* most statements show spending positive; some show it negative */
  let flip = false;
  if (map.amount >= 0) {
    const vals = body.map(function (r) { return parseAmount(r[map.amount]); }).filter(function (n) { return n != null && n !== 0; });
    flip = vals.filter(function (n) { return n < 0; }).length > vals.length / 2;
  }
  map.flip = flip;
  map.hasHeader = hasHeader;
  return map;
}

function signature(rows) {
  return (rows[0] || []).map(function (c) { return c.toLowerCase().replace(/\s+/g, ' '); }).join('|');
}

/* ── categories ── */

const RULES = [
  ['streaming', /netflix|spotify|hulu|disney\s?\+|disney plus|hbo|max\.com|youtube|apple\.com\/bill|prime video|paramount|peacock|crunchyroll|audible|tidal|deezer/],
  ['dining', /uber\s?eats|doordash|grubhub|deliveroo|swiggy|zomato|just eat|restaurant|cafe|café|coffee|starbucks|mcdonald|chipotle|pizza|burger|sushi|taco|kitchen|grill|bistro|diner|bakery|\bpub\b|\bbar\b|dunkin|subway|kfc|nando|pret|greggs|wendy/],
  ['groceries', /whole foods|trader joe|safeway|kroger|aldi|lidl|tesco|sainsbury|waitrose|asda|morrisons|co-?op food|ocado|bigbasket|blinkit|zepto|instamart|dmart|grocery|supermarket|market basket|publix|wegmans|h-e-b|heb |costco|sprouts|food lion/],
  ['gas', /shell|chevron|exxon|\bbp\b|mobil|texaco|sunoco|valero|marathon|speedway|petrol|fuel|gas station|indian oil|hpcl|bharat petroleum|\besso\b/],
  ['transit', /\buber\b(?!\s?eats)|lyft|\bola\b|rapido|metro|\bmta\b|\btfl\b|transit|railway|amtrak|trainline|irctc|parking|toll|bart|caltrain|oyster/],
  ['flights', /airline|airways|air lines|delta air|united air|american air|southwest|jetblue|alaska air|ryanair|easyjet|indigo|air india|vistara|emirates|lufthansa|qatar|klm|air france|british a/],
  ['hotels', /hotel|marriott|hilton|hyatt|ihg|holiday inn|airbnb|booking\.com|expedia|hotels\.com|vrbo|premier inn|travelodge|oyo/],
  ['online', /amazon|amzn|flipkart|myntra|ebay|etsy|aliexpress|temu|shein|nykaa|meesho/],
  ['shopping', /target|best buy|ikea|h&m|zara|uniqlo|nike|adidas|apple store|walmart|primark|marks|john lewis|argos|macy|nordstrom|tj ?maxx/],
  ['bills', /verizon|at&t|t-mobile|tmobile|comcast|xfinity|spectrum|cox comm|electric|water|utility|utilities|pg&e|con ?ed|duke energy|jio|airtel|vodafone|\bvi\b|bsnl|\bee\b|\bbt\b|octopus|british gas|insurance/],
  ['health', /pharmacy|cvs|walgreens|rite aid|boots|clinic|hospital|dental|dentist|doctor|medical|apollo|practo|1mg|pharmeasy/],
  ['home', /\brent\b|mortgage|home depot|lowe'?s|b&q|wayfair|homebase/],
  ['entertainment', /cinema|\bamc\b|regal|odeon|vue |ticketmaster|eventbrite|steam|playstation|xbox|nintendo|\bpvr\b|inox|bookmyshow/]
];

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9&+.' ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function guessCategory(merchant) {
  const m = norm(merchant);
  for (const r of RULES) if (r[1].test(m)) return r[0];
  return 'other';
}

/* a statement line that is one of your tracked subscriptions. A short name has
   to stand as its own word ("MAX.COM", not "MAXWELL'S CAFE"); a longer one may
   sit inside run-together text ("NETFLIXCOM"). */
function matchSub(st, merchant) {
  const words = norm(merchant);
  const m = words.replace(/\s/g, '');
  if (!m) return null;
  return st.subs.filter(function (s) {
    const n = norm(s.name).replace(/\s/g, '').replace(/\+/g, '');
    if (n.length < 3) return false;
    if (n.length >= 6) return m.indexOf(n) !== -1;
    return new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(words);
  })[0] || null;
}

/* ── rows → expenses ── */

function dedupeKey(e) {
  return e.date + '|' + Math.round(e.amount * 100) + '|' + norm(e.merchant).replace(/\s/g, '').slice(0, 18);
}

/* opts: { cur, cardId, st } → { expenses, skipped, duplicates }
   A line is a duplicate when an expense already saved matches it, one for one:
   importing the same statement twice adds nothing, while two identical
   purchases on one day (two bus fares) both count. */
function toExpenses(rows, map, opts) {
  const o = opts || {};
  const body = map.hasHeader ? rows.slice(1) : rows;
  const seen = {};
  if (o.st) o.st.expenses.forEach(function (e) { const k = dedupeKey(e); seen[k] = (seen[k] || 0) + 1; });
  const out = [];
  let skipped = 0, duplicates = 0, credits = 0;
  body.forEach(function (r) {
    const date = parseDate(r[map.date], map.order);
    let amount = null;
    if (map.amount >= 0) {
      amount = parseAmount(r[map.amount]);
      if (amount != null && map.flip) amount = -amount;
    } else if (map.debit >= 0) {
      const dr = parseAmount(r[map.debit]), crd = map.credit >= 0 ? parseAmount(r[map.credit]) : null;
      amount = dr ? Math.abs(dr) : (crd ? -Math.abs(crd) : null);
    }
    if (!date || amount == null || amount === 0) { skipped++; return; }
    /* money coming in (payments, refunds, salary) is not spending */
    if (amount < 0) { credits++; return; }
    const merchant = (r[map.merchant] || '').replace(/\s+/g, ' ').trim();
    const sub = o.st ? matchSub(o.st, merchant) : null;
    const e = ST.store.cleanExpense({
      date: date, amount: amount, cur: o.cur, merchant: merchant,
      cat: sub ? ST.ledger.subSpendCat(sub) : guessCategory(merchant),
      cardId: o.cardId || (sub ? sub.paidWith : ''), subId: sub ? sub.id : '', source: 'csv'
    });
    const k = dedupeKey(e);
    if (seen[k]) { seen[k]--; duplicates++; return; }
    out.push(e);
  });
  return { expenses: out, skipped: skipped, duplicates: duplicates, credits: credits };
}

ST.csv = { parse: parse, parseAmount: parseAmount, parseDate: parseDate, detectOrder: detectOrder,
           guessMapping: guessMapping, signature: signature, guessCategory: guessCategory,
           matchSub: matchSub, dedupeKey: dedupeKey, toExpenses: toExpenses, norm: norm };

})(window.ST = window.ST || {});
