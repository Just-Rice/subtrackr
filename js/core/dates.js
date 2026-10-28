/* dates.js — calendar dates as 'YYYY-MM-DD' strings, handled in local time.
 *
 * Going through toISOString() would convert local midnight to UTC and land on
 * the previous day for every timezone at or ahead of Greenwich, so a renewal
 * date drifts a day earlier each cycle. Nothing here touches UTC.
 */

(function (ST) {
'use strict';

/* tests pin "today"; the app never sets it */
let todayOverride = null;
function setToday(s) { todayOverride = s || null; }

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (isNaN(d.getTime())) return null;
  /* new Date(2026, 12, 45) happily rolls over into the following year rather
     than failing, so reject anything that did not survive the round trip. */
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d;
}

function todayStr() { return todayOverride || ymd(new Date()); }

function addDays(s, n) {
  const d = parseYmd(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return ymd(d);
}

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

function addCycle(s, cycle, anchorDay) {
  const d = parseYmd(s);
  if (!d) return s;
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'fourweekly') d.setDate(d.getDate() + 28);
  else if (cycle === 'monthly') addMonths(d, 1, anchorDay);
  else if (cycle === 'quarterly') addMonths(d, 3, anchorDay);
  else if (cycle === 'semiannual') addMonths(d, 6, anchorDay);
  else addMonths(d, 12, anchorDay);
  return ymd(d);
}

/* whole days from a to b — rounded, so a DST change can't make it 0.96 */
function daysBetween(a, b) {
  const da = parseYmd(a), db = parseYmd(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

function daysUntil(s) { return daysBetween(todayStr(), s); }

/* first occurrence of a recurring date on or after `from` (default today) */
function nextOnOrAfter(s, cycle, from) {
  const start = parseYmd(s);
  if (!start) return null;
  const anchorDay = start.getDate();
  const floor = from || todayStr();
  let d = s;
  let guard = 0;
  /* generous enough to catch a weekly subscription abandoned for twenty years */
  while (d < floor && guard++ < 1200) d = addCycle(d, cycle, anchorDay);
  return d;
}

/* every occurrence in [from, to], both inclusive */
function occurrences(s, cycle, from, to) {
  const first = nextOnOrAfter(s, cycle, from);
  if (!first) return [];
  const anchorDay = parseYmd(s).getDate();
  const out = [];
  let d = first;
  while (d <= to && out.length < 400) { out.push(d); d = addCycle(d, cycle, anchorDay); }
  return out;
}

/* Monday of the week holding s */
function weekStart(s) {
  const d = parseYmd(s);
  if (!d) return s;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

function monthKey(s) { return String(s).slice(0, 7); }

function monthBounds(key) {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1;
  return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
}

function shiftMonth(key, n) {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1 + n;
  return ymd(new Date(y, m, 1)).slice(0, 7);
}

function fmtDate(s, opts) {
  const d = parseYmd(s);
  if (!d) return s || '';
  return d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(s) { return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' }); }

function fmtMonth(key) { return fmtDate(key + '-01', { month: 'long', year: 'numeric' }); }

function relDay(n) {
  if (n == null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return Math.abs(n) + ' days ago';
  return 'in ' + n + ' days';
}

ST.dates = { setToday: setToday, ymd: ymd, parseYmd: parseYmd, todayStr: todayStr, addDays: addDays,
             addMonths: addMonths, addCycle: addCycle, daysBetween: daysBetween, daysUntil: daysUntil,
             nextOnOrAfter: nextOnOrAfter, occurrences: occurrences, weekStart: weekStart,
             monthKey: monthKey, monthBounds: monthBounds, shiftMonth: shiftMonth,
             fmtDate: fmtDate, fmtShort: fmtShort, fmtMonth: fmtMonth, relDay: relDay };

})(window.ST = window.ST || {});
