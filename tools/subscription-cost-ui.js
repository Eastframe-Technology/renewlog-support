// Page code for the subscription cost calculator. Everything stays in this tab.
(function () {
  'use strict';
  var R = window.RenewCalc;
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'BRL', 'MXN', 'CAD', 'AUD', 'CHF', 'INR', 'TRY', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'RON', 'NZD', 'SGD', 'HKD', 'TWD', 'ZAR', 'ILS', 'AED', 'SAR', 'ARS', 'CLP', 'COP', 'PEN', 'THB', 'IDR', 'MYR', 'PHP', 'VND', 'UAH'];
  var PERIOD_LABELS = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
  var EXAMPLE = [['Music', '10.99', 'monthly'], ['Cloud storage', '2.99', 'monthly'], ['Language app', '6.99', 'weekly'], ['Coffee box', '30', 'quarterly'], ['News', '59.99', 'yearly']];

  var rowsEl = document.getElementById('rows');
  var outEl = document.getElementById('result');
  var count = 0;

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function money(v, code) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(v); }
    catch (_) { return v.toFixed(2) + ' ' + code; }
  }

  function lastCurrency() {
    var all = rowsEl.querySelectorAll('.currency');
    return all.length ? all[all.length - 1].value : 'USD';
  }

  function field(label, input) {
    return el('label', { class: 'field' }, [el('span', { text: label }), input]);
  }

  function addRow(values) {
    var v = values || {};
    var n = ++count;
    var name = el('input', { type: 'text', class: 'name', maxlength: '60', placeholder: 'Name, optional', autocomplete: 'off', 'aria-label': 'Subscription ' + n + ' name' });
    var price = el('input', { type: 'text', class: 'price', inputmode: 'decimal', placeholder: '9.99', autocomplete: 'off' });
    var cur = el('select', { class: 'currency' }, CURRENCIES.map(function (c) { return el('option', { value: c, text: c }); }));
    var per = el('select', { class: 'period' }, Object.keys(PERIOD_LABELS).map(function (p) { return el('option', { value: p, text: PERIOD_LABELS[p] }); }));
    cur.value = v.currency || lastCurrency();
    per.value = v.period || 'monthly';
    name.value = v.name || '';
    price.value = v.price || '';
    var del = el('button', { type: 'button', class: 'del', 'aria-label': 'Remove subscription ' + n, title: 'Remove', text: '×' });
    var row = el('div', { class: 'row' }, [field('Name', name), field('Price', price), field('Currency', cur), field('Billed', per), del]);
    del.addEventListener('click', function () { row.remove(); render(); });
    rowsEl.appendChild(row);
    return row;
  }

  function read() {
    return Array.prototype.map.call(rowsEl.querySelectorAll('.row'), function (r) {
      var price = R.parsePrice(r.querySelector('.price').value);
      var p = R.PERIODS[r.querySelector('.period').value];
      return { name: r.querySelector('.name').value.trim(), price: price, currency: r.querySelector('.currency').value, unit: p.unit, every: p.every, period: r.querySelector('.period').value };
    }).filter(function (s) { return s.price !== null; });
  }

  function render() {
    var subs = read();
    outEl.textContent = '';
    if (!subs.length) {
      outEl.appendChild(el('p', { class: 'muted', text: 'Type a price and your monthly and yearly totals appear here.' }));
      return;
    }
    var totals = R.monthlyTotals(subs);
    Object.keys(totals).forEach(function (code) {
      outEl.appendChild(el('div', { class: 'totals' }, [
        el('div', {}, [el('span', { class: 'label', text: 'Per month' + (Object.keys(totals).length > 1 ? ' in ' + code : '') }), el('strong', { text: money(totals[code], code) })]),
        el('div', {}, [el('span', { class: 'label', text: 'Per year' + (Object.keys(totals).length > 1 ? ' in ' + code : '') }), el('strong', { text: money(totals[code] * 12, code) })])
      ]));
    });
    if (Object.keys(totals).length > 1) outEl.appendChild(el('p', { class: 'note', text: 'Each currency has its own total. Nothing is converted, because that would need exchange rates from the internet.' }));
    var sorted = subs.slice().sort(function (a, b) { return R.yearlyCost(b) - R.yearlyCost(a); });
    var head = el('tr', {}, [el('th', { text: 'Subscription' }), el('th', { class: 'num', text: 'Per month' }), el('th', { class: 'num', text: 'Per year' })]);
    var body = sorted.map(function (s) {
      var label = (s.name || 'Unnamed') + ' (' + PERIOD_LABELS[s.period].toLowerCase() + ')';
      return el('tr', {}, [el('td', { text: label }), el('td', { class: 'num', text: money(R.monthlyCost(s), s.currency) }), el('td', { class: 'num', text: money(R.yearlyCost(s), s.currency) })]);
    });
    outEl.appendChild(el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)]));
  }

  document.getElementById('add').addEventListener('click', function () {
    addRow().querySelector('.name').focus();
    render();
  });
  document.getElementById('example').addEventListener('click', function () {
    rowsEl.textContent = '';
    EXAMPLE.forEach(function (e) { addRow({ name: e[0], price: e[1], period: e[2], currency: 'USD' }); });
    render();
  });
  document.getElementById('clear').addEventListener('click', function () {
    rowsEl.textContent = '';
    addRow(); addRow();
    render();
  });
  rowsEl.addEventListener('input', render);
  rowsEl.addEventListener('change', render);
  addRow(); addRow();
  render();
})();
