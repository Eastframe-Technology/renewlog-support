// Date and cost logic for RenewLog's web tools, ported from the app
// (lib/logic/schedule.dart and lib/logic/currencies.dart) so the site and the
// app agree. Runs in a browser (as window.RenewCalc) and under node (require).
//
// Dates are plain {y, m, d} calendar values with m from 1 to 12. All arithmetic
// goes through Date.UTC, which has no daylight saving, so a local day is never
// treated as 24 hours. A date string from <input type=date> is split by hand:
// new Date('2026-11-01') would mean midnight UTC, which is the day before in
// the Americas. Nothing here touches the network.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RenewCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;

  function date(y, m, d) { return { y: y, m: m, d: d }; }
  function dayNumber(a) { return Date.UTC(a.y, a.m - 1, a.d) / DAY_MS; }
  function fromDayNumber(n) {
    var t = new Date(n * DAY_MS);
    return date(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function sameDate(a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; }
  function isBefore(a, b) { return dayNumber(a) < dayNumber(b); }

  /** Today on the visitor's own calendar. */
  function todayLocal(now) {
    var t = now || new Date();
    return date(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  /** [a] plus [n] calendar days. */
  function addDays(a, n) { return fromDayNumber(dayNumber(a) + n); }

  /** Calendar days from [a] to [b]. */
  function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  /** "2026-11-01" to a date, or null when it is not a real calendar date. */
  function parseISO(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return date(y, mo, d);
  }

  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function toISO(a) { return pad(a.y, 4) + '-' + pad(a.m, 2) + '-' + pad(a.d, 2); }

  /** A long date in the visitor's language, for example "Tuesday, December 8, 2026". */
  function formatDate(a, locale) {
    return new Intl.DateTimeFormat(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(a.y, a.m - 1, a.d)));
  }

  /**
   * The [k]-th charge counted from s.first, where s = {first, unit, every} and
   * unit is 'day', 'week', 'month' or 'year'. Months and years keep the original
   * day, clamped to the month's length, so the 31st never drifts.
   */
  function occurrence(s, k) {
    var f = s.first;
    if (s.unit === 'day') return addDays(f, k * s.every);
    if (s.unit === 'week') return addDays(f, 7 * k * s.every);
    var months = k * s.every * (s.unit === 'year' ? 12 : 1);
    var total = f.m - 1 + months;
    var y = f.y + Math.floor(total / 12);
    var m = ((total % 12) + 12) % 12 + 1;
    return date(y, m, Math.min(f.d, daysInMonth(y, m)));
  }

  function approxDays(s) {
    if (s.unit === 'day') return s.every;
    if (s.unit === 'week') return 7 * s.every;
    if (s.unit === 'month') return 30.436875 * s.every;
    return 365.2425 * s.every;
  }

  /** The next charge on or after [today]. */
  function nextCharge(s, today) {
    var days = daysBetween(s.first, today);
    var k = days <= 0 ? 0 : Math.floor(days / approxDays(s)) - 1;
    if (k < 0) k = 0;
    var d = occurrence(s, k);
    while (isBefore(d, today)) { k++; d = occurrence(s, k); }
    while (k > 0 && !isBefore(occurrence(s, k - 1), today)) { k--; d = occurrence(s, k); }
    return d;
  }

  /** The charge after [d], which must be a charge date. */
  function chargeAfter(s, d) { return nextCharge(s, addDays(d, 1)); }

  /** Billing periods offered by the calculators, in the app's unit and step. */
  var PERIODS = {
    weekly: { unit: 'week', every: 1 },
    monthly: { unit: 'month', every: 1 },
    quarterly: { unit: 'month', every: 3 },
    yearly: { unit: 'year', every: 1 }
  };

  /** Average cost per month. s = {price, unit, every}. */
  function monthlyCost(s) {
    if (s.unit === 'day') return s.price * 365.2425 / 12 / s.every;
    if (s.unit === 'week') return s.price * 365.2425 / 7 / 12 / s.every;
    if (s.unit === 'month') return s.price / s.every;
    return s.price / 12 / s.every;
  }

  function yearlyCost(s) { return monthlyCost(s) * 12; }

  /** Monthly totals per currency, as {USD: 12.5}. Rates are never applied. */
  function monthlyTotals(list) {
    var out = {};
    list.forEach(function (s) {
      if (s.active === false) return;
      out[s.currency] = (out[s.currency] || 0) + monthlyCost(s);
    });
    return out;
  }

  /**
   * Parses a price typed as "9.99", "9,99", "1,299.00", "1.299,00" or "1,000".
   * With both separators the last one is the decimal mark. With one kind only,
   * it is a decimal mark when one or two digits follow it, otherwise a
   * thousands mark (so "1,000" yen is a thousand).
   */
  function parsePrice(text) {
    var t = String(text == null ? '' : text).trim().replace(/[^0-9.,]/g, '');
    if (!/[0-9]/.test(t)) return null;
    var dot = t.lastIndexOf('.'), comma = t.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
      var dec = dot > comma ? '.' : ',';
      var thou = dec === '.' ? ',' : '.';
      t = t.split(thou).join('').split(dec).join('.');
    } else if (dot >= 0 || comma >= 0) {
      var sep = dot >= 0 ? '.' : ',';
      var parts = t.split(sep);
      t = parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2 ? parts[0] + '.' + parts[1] : parts.join('');
    }
    var v = parseFloat(t);
    return isNaN(v) ? null : v;
  }

  /** When a reminder fires: [leadDays] calendar days before [event], at [hour]:00 local. */
  function reminderAt(event, leadDays, hour) {
    var a = addDays(event, -leadDays);
    return { y: a.y, m: a.m, d: a.d, hour: hour == null ? 9 : hour };
  }

  /** End of a trial started on [start]: days and weeks count calendar days, months and years clamp like charges. */
  function trialEnd(start, length, unit) {
    return occurrence({ first: start, unit: unit, every: length }, 1);
  }

  /**
   * Everything the trial calculator shows. Give either {end} or {start, length, unit},
   * plus {lead, today}. cancelBy is the day before the end, which also clears
   * the "24 hours before" rule on the App Store.
   */
  function trialPlan(o) {
    var end = o.end || trialEnd(o.start, o.length, o.unit);
    var rem = reminderAt(end, o.lead, 9);
    return {
      end: end,
      cancelBy: addDays(end, -1),
      reminder: date(rem.y, rem.m, rem.d),
      reminderHour: rem.hour,
      daysLeft: daysBetween(o.today, end),
      daysToReminder: daysBetween(o.today, date(rem.y, rem.m, rem.d))
    };
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // Lines over 75 bytes are folded, without splitting a character.
  function icsFold(line) {
    var out = [], cur = '', bytes = 0;
    Array.from(line).forEach(function (ch) {
      var cp = ch.codePointAt(0);
      var n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + n > 74) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += n;
    });
    out.push(cur);
    return out.join('\r\n');
  }

  /**
   * A calendar file with one reminder, in floating local time (no time zone), so
   * it rings at 9:00 wherever the phone is, on the same calendar date.
   * o = {name, end, reminder, hour, stamp: Date}
   */
  function trialIcs(o) {
    var name = (o.name || '').trim().slice(0, 60) || 'Free trial';
    var ymd = function (a) { return toISO(a).replace(/-/g, ''); };
    var hh = pad(o.hour == null ? 9 : o.hour, 2);
    var stamp = (o.stamp || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var summary = 'Cancel ' + name + ' before the trial ends';
    var desc = name + ': the free trial ends on ' + toISO(o.end) + '. Cancel before then if you do not want to pay.';
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eastframe Technology//RenewLog trial calculator//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:trial-' + ymd(o.end) + '-' + ymd(o.reminder) + '-' + stamp + '@renewlog-support',
      'DTSTAMP:' + stamp,
      'DTSTART:' + ymd(o.reminder) + 'T' + hh + '0000',
      'DURATION:PT15M',
      'SUMMARY:' + icsEscape(summary),
      'DESCRIPTION:' + icsEscape(desc),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:' + icsEscape(summary), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', ''
    ].map(icsFold).join('\r\n');
  }

  return {
    date: date, sameDate: sameDate, isBefore: isBefore, todayLocal: todayLocal, addDays: addDays, daysBetween: daysBetween,
    daysInMonth: daysInMonth, parseISO: parseISO, toISO: toISO, formatDate: formatDate, occurrence: occurrence,
    nextCharge: nextCharge, chargeAfter: chargeAfter, PERIODS: PERIODS, monthlyCost: monthlyCost, yearlyCost: yearlyCost,
    monthlyTotals: monthlyTotals, parsePrice: parsePrice, reminderAt: reminderAt, trialEnd: trialEnd, trialPlan: trialPlan,
    trialIcs: trialIcs
  };
});
