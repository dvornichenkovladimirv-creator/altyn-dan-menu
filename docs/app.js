'use strict';

/* ================= Хранилище ================= */

const STORE_KEY = 'budget.v1';
const DEFAULT_STATE = {
  version: 1,
  settings: { currency: '₸', startBalance: 0, reserve: 0 },
  categories: {
    expense: ['Продукты', 'Кафе', 'Транспорт', 'Дом', 'Связь', 'Здоровье', 'Одежда', 'Развлечения', 'Подарки', 'Кредиты', 'Подписки', 'Другое'],
    income: ['Зарплата', 'Подработка', 'Подарки', 'Проценты', 'Другое'],
  },
  limits: {},      // { 'Продукты': 80000 } — лимит переменных трат в месяц
  recurring: [],   // постоянные: { id, type, name, amount, category, freq, day, weekday, month, since, active }
  tx: [],          // операции: { id, type, amount, category, date, note, recurringId?, occ? }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings } };
  } catch (e) {
    console.error(e);
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadState();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Не удалось сохранить: ' + e.message); }
}

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ================= Даты и числа ================= */

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const ymOf = (iso) => iso.slice(0, 7);
const currentYM = () => ymOf(todayISO());
const parseYM = (ym) => { const [y, m] = ym.split('-').map(Number); return { y, m }; };
const daysIn = (ym) => { const { y, m } = parseYM(ym); return new Date(y, m, 0).getDate(); };
function addMonths(ym, n) {
  const { y, m } = parseYM(ym);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const monthLabel = (ym) => { const { y, m } = parseYM(ym); return `${MONTHS[m - 1]} ${y}`; };
const monthShort = (ym) => MONTHS_SHORT[parseYM(ym).m - 1];
function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const t = todayISO();
  const y = toISO(new Date(Date.now() - 864e5));
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (iso === t) return 'Сегодня, ' + base;
  if (iso === y) return 'Вчера, ' + base;
  return `${base}, ${WEEKDAYS[d.getDay()]}`;
}

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
function money(v, sign = false) {
  const n = Math.round(v * 100) / 100;
  const f = Math.abs(n) >= 1000 ? nf0 : nf2;
  const s = f.format(Math.abs(n));
  const pre = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
  return `${pre}${s} ${state.settings.currency}`;
}
function parseAmount(str) {
  const n = parseFloat(String(str).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Расчёты ================= */

// Даты наступления постоянного платежа в месяце ym
function occurrences(rec, ym) {
  if (rec.active === false) return [];
  if (rec.since && ym < ymOf(rec.since)) return [];
  if (rec.until && ym > ymOf(rec.until)) return [];
  const { y, m } = parseYM(ym);
  const dim = daysIn(ym);
  if (rec.freq === 'weekly') {
    const out = [];
    for (let d = 1; d <= dim; d++) {
      if (new Date(y, m - 1, d).getDay() === Number(rec.weekday)) out.push(`${ym}-${pad(d)}`);
    }
    return out.filter((iso) => !rec.since || iso >= rec.since);
  }
  if (rec.freq === 'yearly' && Number(rec.month) !== m) return [];
  return [`${ym}-${pad(Math.min(Number(rec.day) || 1, dim))}`];
}

const paidTx = (rec, occ) => state.tx.find((t) => t.recurringId === rec.id && t.occ === occ);

function fixedItems(ym) {
  const items = [];
  for (const rec of state.recurring) {
    for (const occ of occurrences(rec, ym)) items.push({ rec, occ, tx: paidTx(rec, occ) });
  }
  return items.sort((a, b) => a.occ.localeCompare(b.occ));
}

function monthStats(ym) {
  const txs = state.tx.filter((t) => ymOf(t.date) === ym);
  const s = { ym, txs, income: 0, expense: 0, varInc: 0, varExp: 0, varExpByCat: {}, expByCat: {} };
  for (const t of txs) {
    if (t.type === 'income') {
      s.income += t.amount;
      if (!t.recurringId) s.varInc += t.amount;
    } else {
      s.expense += t.amount;
      s.expByCat[t.category] = (s.expByCat[t.category] || 0) + t.amount;
      if (!t.recurringId) {
        s.varExp += t.amount;
        s.varExpByCat[t.category] = (s.varExpByCat[t.category] || 0) + t.amount;
      }
    }
  }
  const fx = fixedItems(ym);
  s.fixed = fx;
  s.fixedIncPlan = sum(fx.filter((i) => i.rec.type === 'income').map((i) => i.rec.amount));
  s.fixedExpPlan = sum(fx.filter((i) => i.rec.type === 'expense').map((i) => i.rec.amount));
  s.fixedIncLeft = sum(fx.filter((i) => i.rec.type === 'income' && !i.tx).map((i) => i.rec.amount));
  s.fixedExpLeft = sum(fx.filter((i) => i.rec.type === 'expense' && !i.tx).map((i) => i.rec.amount));
  return s;
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function balanceUpTo(isoInclusive) {
  let b = Number(state.settings.startBalance) || 0;
  for (const t of state.tx) {
    if (isoInclusive && t.date > isoInclusive) continue;
    b += t.type === 'income' ? t.amount : -t.amount;
  }
  return b;
}

// Средние переменные доходы/расходы за последние (до 3) полных месяца с данными
function history() {
  const cur = currentYM();
  if (!state.tx.length) return null;
  const first = state.tx.reduce((min, t) => (t.date < min ? t.date : min), state.tx[0].date);
  const months = [];
  for (let ym = addMonths(cur, -1); ym >= ymOf(first) && months.length < 3; ym = addMonths(ym, -1)) months.push(ym);
  if (!months.length) return null;
  const stats = months.map(monthStats);
  const n = stats.length;
  const byCat = {};
  for (const s of stats) for (const [c, v] of Object.entries(s.varExpByCat)) byCat[c] = (byCat[c] || 0) + v / n;
  return {
    months: n,
    varExp: sum(stats.map((s) => s.varExp)) / n,
    varInc: sum(stats.map((s) => s.varInc)) / n,
    varExpByCat: byCat,
  };
}

// Прогноз на текущий месяц
function currentForecast() {
  const ym = currentYM();
  const s = monthStats(ym);
  const hist = history();
  const dim = daysIn(ym);
  const day = new Date().getDate();
  const daysLeft = dim - day; // дни после сегодняшнего

  const rates = [];
  if (hist && hist.varExp > 0) rates.push(hist.varExp / dim);
  if (day >= 3 || !rates.length) rates.push(s.varExp / day);
  const dailyRate = rates.length ? sum(rates) / rates.length : 0;

  const projVarExp = s.varExp + dailyRate * daysLeft;
  const projVarInc = Math.max(s.varInc, hist ? hist.varInc : 0);
  const balanceNow = balanceUpTo(null);
  const endBalance = balanceNow + s.fixedIncLeft + (projVarInc - s.varInc) - s.fixedExpLeft - (projVarExp - s.varExp);

  // Сколько можно тратить в день, чтобы не уйти ниже неснижаемого остатка
  const available = balanceNow + s.fixedIncLeft + (projVarInc - s.varInc) - s.fixedExpLeft - (Number(state.settings.reserve) || 0);
  const perDay = available / (daysLeft + 1);

  // Прогноз по категориям: факт + темп
  const cats = new Set([...Object.keys(s.varExpByCat), ...Object.keys(hist?.varExpByCat || {}), ...Object.keys(state.limits)]);
  const byCat = [...cats].map((c) => {
    const fact = s.varExpByCat[c] || 0;
    const histAvg = hist?.varExpByCat[c] || 0;
    const pace = day >= 3 ? fact / day * dim : fact;
    const proj = hist ? Math.max(fact, (pace + histAvg) / 2) : Math.max(fact, pace);
    return { cat: c, fact, proj, limit: Number(state.limits[c]) || 0 };
  }).filter((x) => x.fact || x.proj || x.limit).sort((a, b) => b.proj - a.proj);

  return { ym, s, hist, dim, day, daysLeft, dailyRate, projVarExp, projVarInc, balanceNow, endBalance, available, perDay, byCat };
}

// Прогноз на N месяцев вперёд
function futureForecast(n = 6) {
  const cf = currentForecast();
  const varExp = cf.hist ? cf.hist.varExp : cf.projVarExp;
  const varInc = cf.hist ? cf.hist.varInc : cf.projVarInc;
  let bal = cf.endBalance;
  const rows = [{
    ym: cf.ym, current: true,
    income: cf.s.fixedIncPlan + cf.projVarInc,
    expense: cf.s.fixedExpPlan + cf.projVarExp,
    fixedInc: cf.s.fixedIncPlan, fixedExp: cf.s.fixedExpPlan, varInc: cf.projVarInc, varExp: cf.projVarExp,
    balance: bal,
  }];
  for (let i = 1; i <= n; i++) {
    const ym = addMonths(cf.ym, i);
    const fx = fixedItems(ym);
    const fixedInc = sum(fx.filter((x) => x.rec.type === 'income').map((x) => x.rec.amount));
    const fixedExp = sum(fx.filter((x) => x.rec.type === 'expense').map((x) => x.rec.amount));
    const income = fixedInc + varInc;
    const expense = fixedExp + varExp;
    bal += income - expense;
    rows.push({ ym, income, expense, fixedInc, fixedExp, varInc, varExp, balance: bal });
  }
  return { cf, rows };
}

/* ================= UI: общее ================= */

const $ = (sel) => document.querySelector(sel);
const view = $('#view');
let tab = 'overview';
let viewYM = currentYM();
let txFilter = 'all';

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2200);
}

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const monthNav = tab === 'overview' || tab === 'tx' || tab === 'fixed';
  $('#prevMonth').style.visibility = monthNav ? 'visible' : 'hidden';
  $('#nextMonth').style.visibility = monthNav ? 'visible' : 'hidden';
  $('#monthTitle').textContent = monthNav ? monthLabel(viewYM) : { forecast: 'Прогноз', settings: 'Настройки' }[tab];
  $('#fab').style.display = tab === 'settings' ? 'none' : '';
  view.innerHTML = { overview: renderOverview, tx: renderTx, fixed: renderFixed, forecast: renderForecast, settings: renderSettings }[tab]();
  window.scrollTo(0, 0);
}

function txRow(t) {
  const sign = t.type === 'income' ? '+' : '−';
  const cls = t.type === 'income' ? 'income' : 'expense';
  const tag = t.recurringId ? ' · постоянный' : '';
  return `<div class="row clickable" data-action="edit-tx" data-id="${t.id}">
    <div class="main"><div class="title">${esc(t.note || t.category)}</div>
    <div class="sub">${esc(t.note ? t.category : '')}${tag}</div></div>
    <div class="amount ${cls}">${sign}${money(t.amount).replace('−', '')}</div></div>`;
}

function catBars(items, totalForScale) {
  if (!items.length) return '<div class="empty small">Пока нет данных</div>';
  const max = totalForScale || Math.max(...items.map((i) => Math.max(i.proj ?? i.value, i.limit || 0)));
  return items.map((i) => {
    const val = i.value ?? i.fact;
    const cap = i.limit || max;
    const pct = Math.min(100, (val / cap) * 100);
    const over = i.limit && (i.proj ?? val) > i.limit;
    const right = i.limit
      ? `${money(val)} <span class="muted">/ ${money(i.limit)}</span>`
      : money(val);
    const projTxt = i.proj != null && Math.round(i.proj) !== Math.round(val)
      ? `<div class="sub ${over ? 'expense' : ''}">прогноз на месяц: ${money(i.proj)}${over ? ' — превысит лимит' : ''}</div>` : (over ? '<div class="sub expense">лимит превышен</div>' : '');
    return `<div class="row"><div class="main">
      <div style="display:flex;justify-content:space-between;gap:8px"><span class="title">${esc(i.cat)}</span><span class="amount">${right}</span></div>
      <div class="bar"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div>${projTxt}</div></div>`;
  }).join('');
}

/* ================= Вкладка «Обзор» ================= */

function renderOverview() {
  const isCurrent = viewYM === currentYM();
  const s = monthStats(viewYM);
  let html = '';

  if (!state.tx.length && !state.recurring.length) {
    html += `<div class="hint">👋 С чего начать:<br>1. Во вкладке <b>Постоянные</b> добавьте зарплату, аренду, кредиты, подписки.<br>
      2. В <b>Ещё</b> укажите текущий остаток на счетах.<br>3. Каждую трату записывайте кнопкой <b>+</b>. Прогноз будет точнее с каждым месяцем.</div>`;
  }

  if (isCurrent) {
    const cf = currentForecast();
    html += `<div class="card">
      <h2>Баланс сейчас</h2>
      <div class="big ${cf.balanceNow < 0 ? 'expense' : ''}">${money(cf.balanceNow)}</div>
      <div class="muted small">К концу месяца (прогноз): <b class="${cf.endBalance < 0 ? 'expense' : ''}">${money(cf.endBalance)}</b></div>
    </div>
    <div class="card">
      <h2>Можно тратить в день</h2>
      <div class="big ${cf.perDay < 0 ? 'expense' : 'income'}">${money(Math.max(cf.perDay, 0))}</div>
      <div class="muted small">${cf.perDay < 0
        ? `Денег не хватает на постоянные платежи: дефицит ${money(-cf.available)}`
        : `на ${cf.daysLeft + 1} дн. с учётом оставшихся постоянных платежей${state.settings.reserve ? ' и подушки ' + money(state.settings.reserve) : ''}. Ваш средний темп: ${money(cf.dailyRate)}/день`}</div>
    </div>`;
  }

  html += `<div class="card"><h2>${isCurrent ? 'Этот месяц' : monthLabel(viewYM)}</h2>
    <div class="grid2">
      <div class="stat"><div class="label">Доходы</div><div class="value income">${money(s.income)}</div></div>
      <div class="stat"><div class="label">Расходы</div><div class="value expense">${money(s.expense)}</div></div>
      <div class="stat"><div class="label">Постоянные: осталось оплатить</div><div class="value">${money(s.fixedExpLeft)}</div></div>
      <div class="stat"><div class="label">Переменные траты</div><div class="value">${money(s.varExp)}</div></div>
    </div>
    <div class="muted small" style="margin-top:8px">Итог месяца: <b class="${s.income - s.expense < 0 ? 'expense' : 'income'}">${money(s.income - s.expense, true)}</b></div>
  </div>`;

  if (isCurrent) {
    const cf = currentForecast();
    html += `<div class="card"><h2>Переменные траты по категориям</h2>${catBars(cf.byCat)}</div>`;
  } else {
    const items = Object.entries(s.expByCat).map(([cat, value]) => ({ cat, value, limit: Number(state.limits[cat]) || 0 })).sort((a, b) => b.value - a.value);
    html += `<div class="card"><h2>Расходы по категориям</h2>${catBars(items)}</div>`;
  }

  const upcoming = s.fixed.filter((i) => !i.tx).slice(0, 5);
  if (upcoming.length) {
    html += `<div class="card"><h2>Ближайшие постоянные</h2>${upcoming.map(fixedRow).join('')}</div>`;
  }
  return html;
}

/* ================= Вкладка «Операции» ================= */

function renderTx() {
  const s = monthStats(viewYM);
  let list = s.txs;
  if (txFilter === 'expense') list = list.filter((t) => t.type === 'expense');
  if (txFilter === 'income') list = list.filter((t) => t.type === 'income');
  list = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  let html = `<div class="seg">
    <button type="button" data-action="filter" data-v="all" class="${txFilter === 'all' ? 'on' : ''}">Все</button>
    <button type="button" data-action="filter" data-v="expense" class="${txFilter === 'expense' ? 'on exp' : ''}">Расходы</button>
    <button type="button" data-action="filter" data-v="income" class="${txFilter === 'income' ? 'on inc' : ''}">Доходы</button>
  </div>`;
  if (!list.length) return html + '<div class="card empty">Операций нет. Нажмите «+», чтобы добавить.</div>';
  html += '<div class="card">';
  let day = '';
  for (const t of list) {
    if (t.date !== day) {
      day = t.date;
      const dayTotal = sum(list.filter((x) => x.date === day).map((x) => (x.type === 'income' ? x.amount : -x.amount)));
      html += `<div class="day-head" style="display:flex;justify-content:space-between"><span>${dayLabel(day)}</span><span>${money(dayTotal, true)}</span></div>`;
    }
    html += txRow(t);
  }
  return html + '</div>';
}

/* ================= Вкладка «Постоянные» ================= */

function freqText(rec) {
  if (rec.freq === 'weekly') return `каждую неделю, ${WEEKDAYS[rec.weekday]}`;
  if (rec.freq === 'yearly') return `раз в год, ${rec.day} ${MONTHS_GEN[rec.month - 1]}`;
  return `каждый месяц, ${rec.day} числа`;
}

function fixedRow(i) {
  const overdue = !i.tx && i.occ < todayISO();
  const cls = i.rec.type === 'income' ? 'income' : 'expense';
  const d = new Date(i.occ + 'T00:00:00');
  return `<div class="row ${i.tx ? 'done' : ''}">
    <button type="button" class="check ${i.tx ? 'on' : ''}" data-action="toggle-paid" data-id="${i.rec.id}" data-occ="${i.occ}" aria-label="Отметить">${i.tx ? '✓' : ''}</button>
    <div class="main clickable" data-action="edit-rec" data-id="${i.rec.id}">
      <div class="title">${esc(i.rec.name)}</div>
      <div class="sub ${overdue ? 'warn' : ''}">${d.getDate()} ${MONTHS_GEN[d.getMonth()]} · ${esc(i.rec.category)}${overdue ? ' · просрочено' : ''}</div>
    </div>
    <div class="amount ${cls}">${i.rec.type === 'income' ? '+' : '−'}${money(i.tx ? i.tx.amount : i.rec.amount)}</div>
  </div>`;
}

function renderFixed() {
  const s = monthStats(viewYM);
  const inc = s.fixed.filter((i) => i.rec.type === 'income');
  const exp = s.fixed.filter((i) => i.rec.type === 'expense');
  let html = `<div class="card"><div class="grid2">
    <div class="stat"><div class="label">Постоянные доходы</div><div class="value income">${money(s.fixedIncPlan)}</div></div>
    <div class="stat"><div class="label">Постоянные расходы</div><div class="value expense">${money(s.fixedExpPlan)}</div></div>
  </div>
  <div class="muted small" style="margin-top:8px">После обязательных платежей остаётся: <b class="${s.fixedIncPlan - s.fixedExpPlan < 0 ? 'expense' : 'income'}">${money(s.fixedIncPlan - s.fixedExpPlan)}</b></div></div>`;

  if (!s.fixed.length) {
    html += '<div class="card empty">Нет постоянных платежей в этом месяце.<br>Нажмите «+», чтобы добавить зарплату, аренду, кредит или подписку.</div>';
  } else {
    html += '<div class="muted small" style="margin:0 4px 8px">Отмечайте галочкой, когда платёж прошёл — он попадёт в операции.</div>';
    if (inc.length) html += `<div class="card"><h2>Доходы</h2>${inc.map(fixedRow).join('')}</div>`;
    if (exp.length) html += `<div class="card"><h2>Расходы</h2>${exp.map(fixedRow).join('')}</div>`;
  }

  const inactive = state.recurring.filter((r) => occurrences(r, viewYM).length === 0);
  if (inactive.length) {
    html += `<div class="card"><h2>Не в этом месяце / на паузе</h2>${inactive.map((r) => `
      <div class="row clickable" data-action="edit-rec" data-id="${r.id}"><div class="main">
        <div class="title">${esc(r.name)}</div><div class="sub">${r.active === false ? 'на паузе' : freqText(r)}</div></div>
        <div class="amount ${r.type === 'income' ? 'income' : 'expense'}">${money(r.amount)}</div></div>`).join('')}</div>`;
  }
  return html;
}

/* ================= Вкладка «Прогноз» ================= */

function renderForecast() {
  const { cf, rows } = futureForecast(6);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  const minBal = rows.reduce((m, r) => (r.balance < m.balance ? r : m), rows[0]);

  let html = '';
  if (!cf.hist) {
    html += '<div class="hint">Истории пока нет — прогноз переменных трат строится по темпу текущего месяца. После первого полного месяца он станет точнее.</div>';
  } else {
    html += `<div class="hint">Переменные траты считаются как среднее за последние ${cf.hist.months} мес.: ${money(cf.hist.varExp)}/мес.</div>`;
  }

  html += `<div class="card"><h2>Этот месяц</h2>
    <div class="grid2">
      <div class="stat"><div class="label">Ожидаемые доходы</div><div class="value income">${money(rows[0].income)}</div></div>
      <div class="stat"><div class="label">Ожидаемые расходы</div><div class="value expense">${money(rows[0].expense)}</div></div>
      <div class="stat"><div class="label">Потрачено (переменные)</div><div class="value">${money(cf.s.varExp)}</div></div>
      <div class="stat"><div class="label">Ещё потратите (прогноз)</div><div class="value">${money(cf.projVarExp - cf.s.varExp)}</div></div>
    </div>
    <div class="muted small" style="margin-top:8px">Остаток на конец месяца: <b class="${cf.endBalance < 0 ? 'expense' : ''}">${money(cf.endBalance)}</b></div>
  </div>`;

  html += `<div class="card"><h2>Доходы и расходы на 6 месяцев</h2>
    <div class="chart">${rows.map((r) => `
      <div class="col"><div class="bars">
        <i class="inc" style="height:${(r.income / max) * 100}%"></i>
        <i class="exp" style="height:${(r.expense / max) * 100}%"></i>
      </div><div class="lbl">${monthShort(r.ym)}</div></div>`).join('')}
    </div>
    <div class="legend"><span><b style="background:var(--income)"></b>доходы</span><span><b style="background:var(--expense)"></b>расходы</span></div>
  </div>`;

  html += `<div class="card"><h2>Остаток по месяцам</h2>
    <table class="fc"><thead><tr><th>Месяц</th><th>Доход</th><th>Расход</th><th>Остаток</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${monthShort(r.ym)}${r.current ? ' •' : ''}</td>
      <td class="income">${nf0.format(r.income)}</td><td class="expense">${nf0.format(r.expense)}</td>
      <td class="${r.balance < 0 ? 'expense' : ''}"><b>${nf0.format(r.balance)}</b></td></tr>`).join('')}
    </tbody></table>
    <div class="muted small" style="margin-top:8px">${minBal.balance < 0
      ? `⚠️ В ${MONTHS[parseYM(minBal.ym).m - 1].toLowerCase()} баланс уйдёт в минус (${money(minBal.balance)}). Сократите переменные траты на ${money(-minBal.balance / (rows.indexOf(minBal) + 1))} в месяц, чтобы этого избежать.`
      : `Через 6 месяцев накопится: <b>${money(rows[rows.length - 1].balance)}</b>. Ежемесячно в плюс: ${money((rows[rows.length - 1].balance - rows[0].balance) / 6)}.`}</div>
  </div>`;

  const r1 = rows[1];
  html += `<div class="card"><h2>Структура следующего месяца</h2>
    <div class="row"><div class="main">Постоянные доходы</div><div class="amount income">${money(r1.fixedInc)}</div></div>
    <div class="row"><div class="main">Переменные доходы (в среднем)</div><div class="amount income">${money(r1.varInc)}</div></div>
    <div class="row"><div class="main">Постоянные расходы</div><div class="amount expense">${money(r1.fixedExp)}</div></div>
    <div class="row"><div class="main">Переменные расходы (в среднем)</div><div class="amount expense">${money(r1.varExp)}</div></div>
  </div>`;

  if (cf.byCat.length) {
    html += `<div class="card"><h2>Прогноз трат по категориям (этот месяц)</h2>${catBars(cf.byCat)}</div>`;
  }
  return html;
}

/* ================= Вкладка «Ещё» ================= */

function renderSettings() {
  const st = state.settings;
  const catList = (type) => state.categories[type].map((c) => `
    <div class="row"><div class="main"><div class="title">${esc(c)}</div>
    ${type === 'expense' ? `<div class="sub">${state.limits[c] ? 'лимит ' + money(state.limits[c]) + '/мес' : 'без лимита'}</div>` : ''}</div>
    ${type === 'expense' ? `<button type="button" class="chips-btn btn ghost" style="width:auto;margin:0;padding:6px 10px" data-action="set-limit" data-cat="${esc(c)}">Лимит</button>` : ''}
    <button type="button" class="btn danger" style="width:auto;margin:0;padding:6px 10px" data-action="del-cat" data-type="${type}" data-cat="${esc(c)}">✕</button></div>`).join('');

  return `<div class="card"><h2>Основное</h2>
    <div class="field"><label>Остаток на счетах на начало учёта</label>
      <input id="setStart" inputmode="decimal" value="${st.startBalance || ''}" placeholder="0"></div>
    <div class="field"><label>Неснижаемый остаток (подушка), не тратить</label>
      <input id="setReserve" inputmode="decimal" value="${st.reserve || ''}" placeholder="0"></div>
    <div class="field"><label>Валюта</label>
      <select id="setCurrency">${['₸', '₽', '$', '€', 'сом', '₴', 'Br'].map((c) => `<option ${c === st.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <button type="button" class="btn" data-action="save-settings">Сохранить</button>
    <button type="button" class="btn ghost" data-action="fix-balance">Скорректировать баланс под фактический</button>
  </div>
  <div class="card"><h2>Категории расходов</h2>${catList('expense')}
    <button type="button" class="btn ghost" data-action="add-cat" data-type="expense">+ Категория расходов</button></div>
  <div class="card"><h2>Категории доходов</h2>${catList('income')}
    <button type="button" class="btn ghost" data-action="add-cat" data-type="income">+ Категория доходов</button></div>
  <div class="card"><h2>Данные</h2>
    <div class="muted small">Данные хранятся только на этом телефоне. Раз в месяц делайте резервную копию.</div>
    <div class="btn-row"><button type="button" class="btn" data-action="export">Резервная копия</button>
    <button type="button" class="btn ghost" data-action="import">Восстановить</button></div>
    <button type="button" class="btn ghost" data-action="csv">Выгрузить операции в CSV (Excel)</button>
    <button type="button" class="btn danger" data-action="reset">Удалить все данные</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
  </div>
  <div class="muted small" style="text-align:center">Операций: ${state.tx.length} · Постоянных: ${state.recurring.length}</div>`;
}

/* ================= Формы (нижняя шторка) ================= */

const sheet = $('#sheet');
const backdrop = $('#sheetBackdrop');
let sheetSubmit = null;

function openSheet(html, onSubmit) {
  sheet.innerHTML = html;
  sheetSubmit = onSubmit;
  backdrop.hidden = false;
  const first = sheet.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
}
function closeSheet() { backdrop.hidden = true; sheet.innerHTML = ''; sheetSubmit = null; }
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
sheet.addEventListener('submit', (e) => { e.preventDefault(); if (sheetSubmit) sheetSubmit(new FormData(sheet)); });

function chipsHTML(name, options, selected) {
  return `<div class="chips" data-chips="${name}">${options.map((o) =>
    `<button type="button" data-chip="${esc(o)}" class="${o === selected ? 'on' : ''}">${esc(o)}</button>`).join('')}</div>
    <input type="hidden" name="${name}" value="${esc(selected)}">`;
}

sheet.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    const box = chip.parentElement;
    box.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    chip.classList.add('on');
    sheet.querySelector(`input[name="${box.dataset.chips}"]`).value = chip.dataset.chip;
    return;
  }
  const typeBtn = e.target.closest('[data-type-switch]');
  if (typeBtn) {
    const type = typeBtn.dataset.typeSwitch;
    sheet.querySelector('input[name="type"]').value = type;
    sheet.querySelectorAll('[data-type-switch]').forEach((b) => { b.className = b === typeBtn ? `on ${type === 'income' ? 'inc' : 'exp'}` : ''; });
    const catBox = sheet.querySelector('[data-cat-box]');
    const cats = state.categories[type];
    catBox.innerHTML = chipsHTML('category', cats, cats[0]);
    return;
  }
  const act = e.target.closest('[data-sheet-action]');
  if (act) {
    const a = act.dataset.sheetAction;
    if (a === 'cancel') closeSheet();
    if (a === 'delete-tx') {
      if (!confirm('Удалить операцию?')) return;
      state.tx = state.tx.filter((t) => t.id !== act.dataset.id);
      save(); closeSheet(); render(); toast('Удалено');
    }
    if (a === 'delete-rec') {
      if (!confirm('Удалить постоянный платёж? Уже записанные операции останутся.')) return;
      state.recurring = state.recurring.filter((r) => r.id !== act.dataset.id);
      state.tx.forEach((t) => { if (t.recurringId === act.dataset.id) { delete t.recurringId; delete t.occ; } });
      save(); closeSheet(); render(); toast('Удалено');
    }
  }
});

sheet.addEventListener('change', (e) => {
  if (e.target.name === 'freq') {
    const f = e.target.value;
    sheet.querySelector('[data-f="day"]').hidden = f === 'weekly';
    sheet.querySelector('[data-f="weekday"]').hidden = f !== 'weekly';
    sheet.querySelector('[data-f="month"]').hidden = f !== 'yearly';
  }
});

function typeSwitch(type) {
  return `<div class="seg">
    <button type="button" data-type-switch="expense" class="${type === 'expense' ? 'on exp' : ''}">Расход</button>
    <button type="button" data-type-switch="income" class="${type === 'income' ? 'on inc' : ''}">Доход</button>
  </div><input type="hidden" name="type" value="${type}">`;
}

function openTxForm(tx) {
  const t = tx || { type: 'expense', amount: '', category: state.categories.expense[0], date: todayISO(), note: '' };
  const defaultDate = !tx && viewYM !== currentYM() ? `${viewYM}-01` : t.date;
  openSheet(`<h2>${tx ? 'Операция' : 'Новая операция'}</h2>
    ${typeSwitch(t.type)}
    <div class="field"><label>Сумма, ${esc(state.settings.currency)}</label>
      <input class="amount-input" name="amount" inputmode="decimal" required value="${t.amount}" placeholder="0" ${tx ? '' : 'autofocus'}></div>
    <div class="field"><label>Категория</label><div data-cat-box>${chipsHTML('category', state.categories[t.type], t.category)}</div></div>
    <div class="field"><label>Дата</label><input type="date" name="date" value="${defaultDate}" required></div>
    <div class="field"><label>Комментарий</label><input name="note" value="${esc(t.note)}" placeholder="Необязательно"></div>
    <button class="btn" type="submit">Сохранить</button>
    ${tx ? `<button type="button" class="btn danger" data-sheet-action="delete-tx" data-id="${tx.id}">Удалить</button>` : ''}
    <button type="button" class="btn ghost" data-sheet-action="cancel">Отмена</button>`,
  (fd) => {
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) return toast('Введите сумму');
    const data = { type: fd.get('type'), amount, category: fd.get('category'), date: fd.get('date'), note: fd.get('note').trim() };
    if (tx) Object.assign(tx, data);
    else state.tx.push({ id: uid(), ...data });
    save(); closeSheet();
    viewYM = ymOf(data.date);
    render();
    toast(tx ? 'Сохранено' : 'Добавлено');
  });
}

function openRecForm(rec) {
  const r = rec || { type: 'expense', name: '', amount: '', category: state.categories.expense[0], freq: 'monthly', day: new Date().getDate(), weekday: 1, month: new Date().getMonth() + 1, since: `${currentYM()}-01`, active: true };
  openSheet(`<h2>${rec ? 'Постоянный платёж' : 'Новый постоянный платёж'}</h2>
    ${typeSwitch(r.type)}
    <div class="field"><label>Название</label><input name="name" required value="${esc(r.name)}" placeholder="Зарплата, аренда, кредит…" ${rec ? '' : 'autofocus'}></div>
    <div class="field"><label>Сумма, ${esc(state.settings.currency)}</label><input class="amount-input" name="amount" inputmode="decimal" required value="${r.amount}" placeholder="0"></div>
    <div class="field"><label>Категория</label><div data-cat-box>${chipsHTML('category', state.categories[r.type], r.category)}</div></div>
    <div class="field"><label>Периодичность</label><select name="freq">
      <option value="monthly" ${r.freq === 'monthly' ? 'selected' : ''}>Каждый месяц</option>
      <option value="weekly" ${r.freq === 'weekly' ? 'selected' : ''}>Каждую неделю</option>
      <option value="yearly" ${r.freq === 'yearly' ? 'selected' : ''}>Раз в год</option></select></div>
    <div class="field" data-f="day" ${r.freq === 'weekly' ? 'hidden' : ''}><label>Число месяца</label><input name="day" type="number" min="1" max="31" value="${r.day}"></div>
    <div class="field" data-f="weekday" ${r.freq !== 'weekly' ? 'hidden' : ''}><label>День недели</label><select name="weekday">
      ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${Number(r.weekday) === d ? 'selected' : ''}>${WEEKDAYS[d]}</option>`).join('')}</select></div>
    <div class="field" data-f="month" ${r.freq !== 'yearly' ? 'hidden' : ''}><label>Месяц</label><select name="month">
      ${MONTHS.map((m, i) => `<option value="${i + 1}" ${Number(r.month) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="field"><label>Действует с</label><input type="date" name="since" value="${r.since || ''}"></div>
    <div class="field"><label>Действует до (необязательно — например, последний платёж по кредиту)</label><input type="date" name="until" value="${r.until || ''}"></div>
    <div class="field"><label><input type="checkbox" name="active" ${r.active !== false ? 'checked' : ''} style="width:auto;margin-right:6px">Активен</label></div>
    <button class="btn" type="submit">Сохранить</button>
    ${rec ? `<button type="button" class="btn danger" data-sheet-action="delete-rec" data-id="${rec.id}">Удалить</button>` : ''}
    <button type="button" class="btn ghost" data-sheet-action="cancel">Отмена</button>`,
  (fd) => {
    const amount = parseAmount(fd.get('amount'));
    if (!(amount > 0)) return toast('Введите сумму');
    const data = {
      type: fd.get('type'), name: fd.get('name').trim(), amount, category: fd.get('category'),
      freq: fd.get('freq'), day: Math.min(31, Math.max(1, Number(fd.get('day')) || 1)),
      weekday: Number(fd.get('weekday')), month: Number(fd.get('month')),
      since: fd.get('since') || '', until: fd.get('until') || '', active: fd.get('active') === 'on',
    };
    if (rec) Object.assign(rec, data);
    else state.recurring.push({ id: uid(), ...data });
    save(); closeSheet(); render();
    toast('Сохранено');
  });
}

function promptAmount(title, value, cb) {
  openSheet(`<h2>${esc(title)}</h2>
    <div class="field"><input class="amount-input" name="v" inputmode="decimal" value="${value ?? ''}" placeholder="0" autofocus></div>
    <button class="btn" type="submit">Готово</button>
    <button type="button" class="btn ghost" data-sheet-action="cancel">Отмена</button>`,
  (fd) => { cb(fd.get('v')); closeSheet(); });
}

/* ================= Действия ================= */

document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('.tabbar button');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); return; }

  const el = e.target.closest('[data-action]');
  if (!el || sheet.contains(el)) return;
  const a = el.dataset.action;

  if (a === 'filter') { txFilter = el.dataset.v; render(); }
  if (a === 'edit-tx') openTxForm(state.tx.find((t) => t.id === el.dataset.id));
  if (a === 'edit-rec') openRecForm(state.recurring.find((r) => r.id === el.dataset.id));

  if (a === 'toggle-paid') {
    const rec = state.recurring.find((r) => r.id === el.dataset.id);
    const occ = el.dataset.occ;
    const existing = paidTx(rec, occ);
    if (existing) {
      state.tx = state.tx.filter((t) => t !== existing);
      toast('Отметка снята');
    } else {
      const today = todayISO();
      state.tx.push({ id: uid(), type: rec.type, amount: rec.amount, category: rec.category, date: occ > today ? today : occ, note: rec.name, recurringId: rec.id, occ });
      toast(rec.type === 'income' ? 'Доход записан' : 'Платёж записан');
    }
    save(); render();
  }

  if (a === 'save-settings') {
    state.settings.startBalance = parseAmount($('#setStart').value) || 0;
    state.settings.reserve = parseAmount($('#setReserve').value) || 0;
    state.settings.currency = $('#setCurrency').value;
    save(); toast('Сохранено');
  }
  if (a === 'fix-balance') {
    promptAmount('Сколько денег у вас сейчас фактически?', '', (v) => {
      const actual = parseAmount(v);
      if (!Number.isFinite(actual)) return;
      state.settings.startBalance = (Number(state.settings.startBalance) || 0) + (actual - balanceUpTo(null));
      save(); render(); toast('Баланс скорректирован');
    });
  }
  if (a === 'add-cat') {
    const name = prompt('Название категории')?.trim();
    if (name && !state.categories[el.dataset.type].includes(name)) {
      state.categories[el.dataset.type].push(name); save(); render();
    }
  }
  if (a === 'del-cat') {
    const list = state.categories[el.dataset.type];
    if (list.length <= 1) return toast('Нужна хотя бы одна категория');
    if (!confirm(`Удалить категорию «${el.dataset.cat}»? Операции останутся.`)) return;
    state.categories[el.dataset.type] = list.filter((c) => c !== el.dataset.cat);
    save(); render();
  }
  if (a === 'set-limit') {
    const cat = el.dataset.cat;
    promptAmount(`Лимит в месяц: ${cat} (0 — без лимита)`, state.limits[cat], (v) => {
      const n = parseAmount(v);
      if (n > 0) state.limits[cat] = n; else delete state.limits[cat];
      save(); render();
    });
  }
  if (a === 'export') {
    download(`budget-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  }
  if (a === 'import') $('#importFile').click();
  if (a === 'csv') {
    const rows = [['Дата', 'Тип', 'Категория', 'Сумма', 'Комментарий', 'Постоянный']];
    [...state.tx].sort((x, y) => x.date.localeCompare(y.date)).forEach((t) =>
      rows.push([t.date, t.type === 'income' ? 'Доход' : 'Расход', t.category, String(t.amount).replace('.', ','), t.note || '', t.recurringId ? 'да' : '']));
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(`budget-${todayISO()}.csv`, csv, 'text/csv');
  }
  if (a === 'reset') {
    if (confirm('Удалить ВСЕ данные без возможности восстановления?') && confirm('Точно? Сначала лучше сделать резервную копию.')) {
      state = structuredClone(DEFAULT_STATE); save(); render(); toast('Данные удалены');
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'importFile') return;
  const file = e.target.files[0];
  if (!file) return;
  file.text().then((txt) => {
    const data = JSON.parse(txt);
    if (!Array.isArray(data.tx) || !Array.isArray(data.recurring)) throw new Error('не похоже на резервную копию');
    if (!confirm(`Восстановить ${data.tx.length} операций и ${data.recurring.length} постоянных? Текущие данные будут заменены.`)) return;
    state = { ...structuredClone(DEFAULT_STATE), ...data };
    save(); render(); toast('Восстановлено');
  }).catch((err) => toast('Ошибка: ' + err.message));
});

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#fab').addEventListener('click', () => (tab === 'fixed' ? openRecForm() : openTxForm()));
$('#prevMonth').addEventListener('click', () => { viewYM = addMonths(viewYM, -1); render(); });
$('#nextMonth').addEventListener('click', () => { viewYM = addMonths(viewYM, 1); render(); });

// Свайп влево/вправо — переключение месяца
let touchX = null;
view.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
view.addEventListener('touchend', (e) => {
  if (touchX == null || !['overview', 'tx', 'fixed'].includes(tab)) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 80) { viewYM = addMonths(viewYM, dx < 0 ? 1 : -1); render(); }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
