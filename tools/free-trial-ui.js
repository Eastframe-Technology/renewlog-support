// Page code for the free trial calculator. Everything stays in this tab.
(function () {
  'use strict';
  var R = window.RenewCalc;
  var $ = function (id) { return document.getElementById(id); };
  var today = R.todayLocal();
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'KRW', 'CNY', 'NZD', 'SGD', 'ZAR'];
  var PERIOD_WORDS = { weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };

  $('currency').innerHTML = CURRENCIES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  $('start').value = R.toISO(today);
  $('end').value = R.toISO(R.addDays(today, 7));

  function money(v, code) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(v); }
    catch (_) { return v.toFixed(2) + ' ' + code; }
  }
  function long(d) { return R.formatDate(d, undefined); }
  function inDays(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
  }
  function row(label, value, note) {
    return '<div class="answer"><span class="label">' + label + '</span><strong>' + value + '</strong>' + (note ? '<span class="note">' + note + '</span>' : '') + '</div>';
  }
  function mode() { return document.querySelector('input[name=mode]:checked').value; }

  var plan = null;

  function render() {
    var known = mode() === 'end';
    $('byStart').hidden = known;
    $('byEnd').hidden = !known;
    var lead = parseInt($('lead').value, 10);
    var input = { lead: lead, today: today };
    var problem = null;
    if (known) {
      input.end = R.parseISO($('end').value);
      if (!input.end) problem = 'Choose the date the trial ends.';
    } else {
      input.start = R.parseISO($('start').value);
      input.length = parseInt($('length').value, 10);
      input.unit = $('unit').value;
      if (!input.start) problem = 'Choose the date the trial started.';
      else if (!(input.length >= 1 && input.length <= 1000)) problem = 'Enter a trial length of at least 1.';
    }
    var out = $('result');
    plan = null;
    $('ics').hidden = true;
    if (problem) { out.innerHTML = '<p class="muted">' + problem + '</p>'; return; }
    plan = R.trialPlan(input);

    var html = row('Trial ends and the first charge is due', long(plan.end), inDays(plan.daysLeft));
    if (plan.daysLeft < 0) {
      html += '<p class="warn">That date has passed. If you were charged, the guide below says what to do next.</p>';
    } else {
      html += row('Safe last day to cancel', long(plan.cancelBy), '(' + inDays(plan.daysLeft - 1) + ') One day early covers time zones and the 24-hour rule on the App Store.');
      html += row('Set your reminder for', long(plan.reminder) + ', 9:00', lead + (lead === 1 ? ' day' : ' days') + ' before the trial ends (' + inDays(plan.daysToReminder) + ')');
      if (plan.daysToReminder < 0) html += '<p class="warn">That reminder date has already passed. Decide today, or choose a shorter lead time.</p>';
      else $('ics').hidden = false;
    }
    var price = R.parsePrice($('price').value);
    if (price !== null && plan.daysLeft >= 0) {
      var per = $('period').value;
      var p = R.PERIODS[per];
      var s = { first: plan.end, unit: p.unit, every: p.every, price: price };
      var code = $('currency').value;
      html += '<p class="stakes">If you do nothing: ' + money(price, code) + ' around ' + long(plan.end) + ', then again around ' + long(R.chargeAfter(s, plan.end)) + '. That is ' + money(R.yearlyCost(s), code) + ' a year.</p>';
    }
    out.innerHTML = html;
  }

  $('ics').addEventListener('click', function () {
    if (!plan) return;
    var text = R.trialIcs({ name: $('name').value, end: plan.end, reminder: plan.reminder, hour: plan.reminderHour });
    var url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'free-trial-reminder.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (b) {
    b.addEventListener('click', function () {
      $('length').value = b.getAttribute('data-n');
      $('unit').value = b.getAttribute('data-u');
      render();
    });
  });
  $('form').addEventListener('input', render);
  $('form').addEventListener('change', render);
  $('form').addEventListener('submit', function (e) { e.preventDefault(); });
  render();
})();
