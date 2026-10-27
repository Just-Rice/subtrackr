/* ics.js — every renewal, card fee, trial deadline and sign-up bonus deadline
 * as an iCalendar file, built in the browser. Recurring charges become
 * recurring events, each with a reminder the day before.
 */

(function (ST) {
'use strict';

const D = ST.dates, M = ST.money, L = ST.ledger;

function esc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/* RFC 5545: lines over 75 octets continue on the next line after a space */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function day(s) { return s.replace(/-/g, ''); }

function rrule(cycle, start) {
  const dom = Number(start.slice(8, 10));
  /* a 29th–31st anchor would skip short months under BYMONTHDAY; the last day is closer */
  const monthly = function (n) { return 'FREQ=MONTHLY' + (n > 1 ? ';INTERVAL=' + n : '') + (dom > 28 ? ';BYMONTHDAY=-1' : ''); };
  return {
    weekly: 'FREQ=WEEKLY', fourweekly: 'FREQ=WEEKLY;INTERVAL=4',
    monthly: monthly(1), quarterly: monthly(3), semiannual: monthly(6), yearly: 'FREQ=YEARLY'
  }[cycle] || monthly(1);
}

function event(o, stamp) {
  const lines = [
    'BEGIN:VEVENT',
    'UID:' + o.uid + '@subtrackr',
    'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + day(o.date),
    'DTEND;VALUE=DATE:' + day(D.addDays(o.date, 1)),
    'SUMMARY:' + esc(o.summary),
    'TRANSP:TRANSPARENT'
  ];
  if (o.rrule) lines.push('RRULE:' + o.rrule);
  if (o.description) lines.push('DESCRIPTION:' + esc(o.description));
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(o.summary), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
  return lines;
}

function build(st, now) {
  const stamp = (now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const evs = [];
  L.activeSubs(st).forEach(function (s) {
    if (s.nextDate) {
      const start = D.nextOnOrAfter(s.nextDate, s.cycle);
      evs.push({ uid: 'sub-' + s.id, date: start, rrule: rrule(s.cycle, start),
        summary: s.name + ' renews — ' + M.fmtMoney(s.amount, s.cur),
        description: (s.tierName ? s.tierName + ', ' : '') + M.cycle(s.cycle).label.toLowerCase() + (s.shareCount > 1 ? ', split ' + s.shareCount + ' ways' : '') });
    }
    if (s.trialEnds && D.daysUntil(s.trialEnds) >= 0) {
      evs.push({ uid: 'trial-' + s.id + '-' + s.trialEnds, date: D.addDays(s.trialEnds, -1),
        summary: 'Last day to cancel the ' + s.name + ' trial',
        description: 'It renews at ' + M.fmtMoney(s.amount, s.cur) + ' ' + M.cycle(s.cycle).label.toLowerCase() + ' from ' + D.fmtDate(s.trialEnds) + '.' });
    }
  });
  st.cards.filter(function (c) { return c.active; }).forEach(function (c) {
    if (c.feeDate && c.fee > 0) {
      const start = D.nextOnOrAfter(c.feeDate, 'yearly');
      evs.push({ uid: 'fee-' + c.id, date: start, rrule: 'FREQ=YEARLY',
        summary: c.name + ' annual fee — ' + M.fmtMoney(c.fee, c.cur, { dec: 0 }), description: c.issuer });
    }
    if (c.bonus && !c.bonus.done && c.bonus.deadline && D.daysUntil(c.bonus.deadline) >= 0) {
      evs.push({ uid: 'bonus-' + c.id, date: c.bonus.deadline, summary: c.name + ' sign-up bonus spend deadline' });
    }
  });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Subtrackr//Renewals//EN', 'CALSCALE:GREGORIAN',
                 'METHOD:PUBLISH', 'X-WR-CALNAME:Subtrackr'];
  evs.forEach(function (e) { Array.prototype.push.apply(lines, event(e, stamp)); });
  lines.push('END:VCALENDAR');
  return { text: lines.map(fold).join('\r\n') + '\r\n', count: evs.length };
}

function exportFile(st) {
  const out = build(st);
  if (!out.count) { ST.ui.toast('Nothing dated to export — add renewal dates or card fee dates first.'); return; }
  ST.ui.download('subtrackr-renewals.ics', out.text, 'text/calendar');
  ST.ui.toast(out.count + ' recurring reminders exported. Open the file to add them to your calendar.');
}

ST.ics = { build: build, exportFile: exportFile, rrule: rrule, fold: fold };

})(window.ST = window.ST || {});
