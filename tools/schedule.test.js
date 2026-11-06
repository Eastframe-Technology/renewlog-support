// Run with: node --test tools/schedule.test.js
// Run it under several time zones too, for example:
//   for z in America/New_York Europe/Paris Pacific/Apia Asia/Kolkata Australia/Lord_Howe; do TZ=$z node --test tools/schedule.test.js; done
// The vectors marked "app" come from the RenewLog app's test/schedule_test.dart
// and test/currency_test.dart. The rest cover the web tools and this site's pages.
const test = require('node:test');
const assert = require('node:assert');
const R = require('./schedule.js');

const D = R.date;
const sub = (first, unit = 'month', every = 1) => ({ first, unit, every });
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `got ${a}, expected ${b} +/- ${tol}`);

test('app: monthly on the 31st stays on month ends without drifting', () => {
  const s = sub(D(2026, 1, 31));
  eq(R.nextCharge(s, D(2026, 2, 1)), D(2026, 2, 28));
  eq(R.nextCharge(s, D(2026, 3, 1)), D(2026, 3, 31));
  eq(R.nextCharge(s, D(2026, 4, 15)), D(2026, 4, 30));
  eq(R.nextCharge(s, D(2028, 2, 2)), D(2028, 2, 29));
});

test('app: today counts as the next charge; a past first charge rolls forward', () => {
  const s = sub(D(2025, 11, 5));
  eq(R.nextCharge(s, D(2026, 11, 5)), D(2026, 11, 5));
  eq(R.nextCharge(s, D(2026, 11, 6)), D(2026, 12, 5));
  eq(R.nextCharge(s, D(2026, 12, 31)), D(2027, 1, 5));
});

test('app: a future first charge is the next charge', () => {
  eq(R.nextCharge(sub(D(2027, 3, 1), 'year'), D(2026, 11, 2)), D(2027, 3, 1));
});

test('app: yearly on 29 February', () => {
  const s = sub(D(2024, 2, 29), 'year');
  eq(R.nextCharge(s, D(2026, 1, 1)), D(2026, 2, 28));
  eq(R.nextCharge(s, D(2027, 6, 1)), D(2028, 2, 29));
});

test('app: weekly, every 3 months, every 10 days', () => {
  eq(R.nextCharge(sub(D(2026, 10, 1), 'week'), D(2026, 11, 2)), D(2026, 11, 5));
  eq(R.nextCharge(sub(D(2026, 1, 15), 'month', 3), D(2026, 11, 2)), D(2027, 1, 15));
  eq(R.nextCharge(sub(D(2026, 10, 1), 'day', 10), D(2026, 11, 2)), D(2026, 11, 10));
});

test('app: a long-running subscription is computed exactly', () => {
  const s = sub(D(2010, 5, 31));
  eq(R.nextCharge(s, D(2026, 6, 1)), D(2026, 6, 30));
  eq(R.chargeAfter(s, D(2026, 6, 30)), D(2026, 7, 31));
});

test('app: a daylight-saving day does not stall the calendar (US: 1 Nov 2026)', () => {
  const s = sub(D(2026, 11, 1));
  eq(R.chargeAfter(s, D(2026, 11, 1)), D(2026, 12, 1));
  eq(R.daysBetween(D(2026, 11, 1), D(2026, 11, 5)), 4);
  eq(R.addDays(D(2026, 3, 8), 1), D(2026, 3, 9));
});

test('app: monthly equivalents', () => {
  close(R.monthlyCost({ price: 120, unit: 'year', every: 1 }), 10);
  close(R.monthlyCost({ price: 30, unit: 'month', every: 3 }), 10);
  close(R.monthlyCost({ price: 7, unit: 'week', every: 1 }), 30.44, 0.01);
  close(R.yearlyCost({ price: 9.99, unit: 'month', every: 1 }), 119.88);
});

test('app: totals per currency skip cancelled ones', () => {
  const m = (price, currency = 'EUR', unit = 'month', active = true) => ({ price, currency, unit, every: 1, active });
  const t = R.monthlyTotals([m(10), m(5), m(120, 'EUR', 'year'), m(8, 'USD'), m(99, 'EUR', 'month', false)]);
  close(t.EUR, 25);
  close(t.USD, 8);
  eq(Object.keys(t).sort(), ['EUR', 'USD']);
});

test('app: reminders fire before the event at 9:00', () => {
  eq(R.reminderAt(D(2026, 11, 3), 1), { y: 2026, m: 11, d: 2, hour: 9 });
  eq(R.reminderAt(D(2026, 11, 9), 3), { y: 2026, m: 11, d: 6, hour: 9 });
});

test('app: prices typed in any common way', () => {
  eq(R.parsePrice('9.99'), 9.99);
  eq(R.parsePrice('9,99'), 9.99);
  eq(R.parsePrice('€ 12,5'), 12.5);
  eq(R.parsePrice('1,299.00'), 1299);
  eq(R.parsePrice('1.299,00'), 1299);
  eq(R.parsePrice('1,000'), 1000);
  eq(R.parsePrice('1 490'), 1490);
  eq(R.parsePrice('15'), 15);
  eq(R.parsePrice(''), null);
  eq(R.parsePrice('abc'), null);
});

test('the four periods on the calculator', () => {
  const cost = (price, p) => R.monthlyCost(Object.assign({ price }, R.PERIODS[p]));
  close(cost(10, 'monthly'), 10);
  close(cost(30, 'quarterly'), 10);
  close(cost(120, 'yearly'), 10);
  close(cost(7, 'weekly'), 365.2425 / 12);
  close(R.yearlyCost(Object.assign({ price: 7 }, R.PERIODS.weekly)), 365.2425);
});

test('worked example printed on the cost calculator page', () => {
  const rows = [[10.99, 'monthly'], [2.99, 'monthly'], [6.99, 'weekly'], [30, 'quarterly'], [59.99, 'yearly']]
    .map(([price, p]) => Object.assign({ price, currency: 'USD' }, R.PERIODS[p]));
  close(R.monthlyCost(rows[2]), 30.39, 0.005);
  close(R.yearlyCost(rows[2]), 364.72, 0.005);
  close(R.monthlyCost(rows[4]), 5.00, 0.005);
  const month = R.monthlyTotals(rows).USD;
  close(month, 59.37, 0.005);
  close(month * 12, 712.47, 0.005);
});

test('trial end: days and weeks are calendar days, across both US clock changes', () => {
  eq(R.trialEnd(D(2026, 10, 31), 1, 'day'), D(2026, 11, 1));
  eq(R.trialEnd(D(2026, 10, 31), 2, 'day'), D(2026, 11, 2));
  eq(R.trialEnd(D(2026, 11, 1), 7, 'day'), D(2026, 11, 8));
  eq(R.trialEnd(D(2026, 10, 25), 7, 'day'), D(2026, 11, 1));
  eq(R.trialEnd(D(2027, 3, 13), 1, 'day'), D(2027, 3, 14));
  eq(R.trialEnd(D(2027, 3, 14), 1, 'day'), D(2027, 3, 15));
  eq(R.trialEnd(D(2027, 3, 1), 2, 'week'), D(2027, 3, 15));
  eq(R.trialEnd(D(2026, 12, 28), 7, 'day'), D(2027, 1, 4));
});

test('trial end: months and years clamp to the end of a short month', () => {
  eq(R.trialEnd(D(2027, 1, 31), 1, 'month'), D(2027, 2, 28));
  eq(R.trialEnd(D(2028, 1, 31), 1, 'month'), D(2028, 2, 29));
  eq(R.trialEnd(D(2026, 11, 30), 3, 'month'), D(2027, 2, 28));
  eq(R.trialEnd(D(2028, 2, 29), 1, 'year'), D(2029, 2, 28));
});

test('every calendar day of 2026-2028 steps by exactly one, in this time zone too', () => {
  let d = D(2026, 1, 1);
  for (let i = 0; i < 1096; i++) {
    const n = R.addDays(d, 1);
    eq(R.daysBetween(d, n), 1);
    eq(R.addDays(n, -1), d);
    // The same step built with the local calendar constructor agrees.
    const local = new Date(d.y, d.m - 1, d.d + 1);
    eq(n, D(local.getFullYear(), local.getMonth() + 1, local.getDate()));
    d = n;
  }
  eq(d, D(2029, 1, 1));
});

test('adding 24 hours is the bug this avoids: the local clock agrees with the calendar answer', () => {
  // At 23:30 on the night US clocks go back, date math on calendar fields gives 2 Nov.
  const late = new Date(2026, 10, 1, 23, 30);
  eq(R.todayLocal(late), D(2026, 11, 1));
  eq(R.addDays(R.todayLocal(late), 1), D(2026, 11, 2));
});

test('date input strings are split by hand and validated', () => {
  eq(R.parseISO('2026-11-01'), D(2026, 11, 1));
  eq(R.parseISO('2028-02-29'), D(2028, 2, 29));
  eq(R.parseISO('2027-02-29'), null);
  eq(R.parseISO('2026-13-01'), null);
  eq(R.parseISO('nope'), null);
  eq(R.parseISO(''), null);
  eq(R.toISO(D(2026, 3, 8)), '2026-03-08');
});

test('a formatted date never shifts by a day, whatever the time zone', () => {
  assert.match(R.formatDate(D(2026, 11, 1), 'en-US'), /^Sunday, November 1, 2026$/);
  assert.match(R.formatDate(D(2027, 3, 14), 'en-US'), /^Sunday, March 14, 2027$/);
  assert.match(R.formatDate(D(2026, 12, 31), 'en-US'), /^Thursday, December 31, 2026$/);
});

test('trial plan: the worked example on the page', () => {
  const p = R.trialPlan({ start: D(2026, 11, 1), length: 7, unit: 'day', lead: 3, today: D(2026, 11, 1) });
  eq(p.end, D(2026, 11, 8));
  eq(p.cancelBy, D(2026, 11, 7));
  eq(p.reminder, D(2026, 11, 5));
  eq(p.reminderHour, 9);
  eq(p.daysLeft, 7);
  eq(p.daysToReminder, 4);
});

test('trial plan: from a known end date, with a reminder already past', () => {
  const p = R.trialPlan({ end: D(2026, 11, 8), lead: 7, today: D(2026, 11, 6) });
  eq(p.reminder, D(2026, 11, 1));
  assert.ok(p.daysToReminder < 0);
  eq(p.daysLeft, 2);
});

test('charges after the trial follow the billing period from the end date', () => {
  const s = Object.assign({ first: D(2027, 1, 31) }, R.PERIODS.monthly);
  eq(R.chargeAfter(s, s.first), D(2027, 2, 28));
  eq(R.chargeAfter(s, D(2027, 2, 28)), D(2027, 3, 31));
});

test('calendar file: floating 9:00 on the reminder date, CRLF, escaped, folded', () => {
  const ics = R.trialIcs({ name: 'Video, Inc; plus', end: D(2026, 11, 8), reminder: D(2026, 11, 5), hour: 9, stamp: new Date(Date.UTC(2026, 10, 1, 12, 0, 0)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('\r\nDTSTART:20261105T090000\r\n'), 'no Z and no TZID, so it stays local');
  assert.ok(ics.includes('DTSTAMP:20261101T120000Z'));
  assert.ok(ics.includes('SUMMARY:Cancel Video\\, Inc\; plus before the trial ends'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const long = R.trialIcs({ name: 'é'.repeat(60), end: D(2026, 11, 8), reminder: D(2026, 11, 5), stamp: new Date(0) });
  for (const line of long.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(long.replace(/\r\n /g, '').includes('é'.repeat(60)), 'folding keeps characters whole');
});
