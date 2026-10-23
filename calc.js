/* Ядро расчётов металлоконструкций. Без DOM — работает и в браузере, и в Node (тесты). */
(function (root) {
  'use strict';

  var STEEL = 0.00785; // кг на мм² сечения на метр длины (плотность 7850 кг/м³)

  /* ---------- Вес погонного метра / м² по геометрии ---------- */
  // Размеры в мм. Возвращает кг на единицу (метр, м² или штука).
  function kgPerUnit(m) {
    var d = m.dims || {};
    var a = +d.a || 0, b = +d.b || 0, t = +d.t || 0, D = +d.d || 0;
    switch (m.kind) {
      case 'square': b = a; /* fallthrough */
      case 'rect': {
        // ГОСТ 30245: наружный радиус 2t, внутренний t — поправка на скругления
        var area = 2 * t * (a + b) - 4 * t * t - (4 - Math.PI) * 3 * t * t;
        return area > 0 ? area * STEEL : 0;
      }
      case 'round': return D > t ? Math.PI * t * (D - t) * STEEL : 0;
      case 'angle': return t * ((a || 0) + (b || a) - t) * STEEL;
      case 'rod': return Math.PI * D * D / 4 * STEEL;
      case 'strip': return a * t * STEEL;
      case 'sheet': return t * 7.85; // кг/м²
      default: return +m.kgPerUnit || 0; // custom: вес задан вручную
    }
  }

  function unitOf(kind) {
    if (kind === 'sheet') return 'м²';
    return kind === 'custom' ? null : 'м';
  }

  // Цена единицы (метра/м²/шт) с учётом режима цены
  function unitPrice(m) {
    var kg = materialKg(m);
    return m.priceMode === 'kg' ? (+m.price || 0) * kg : (+m.price || 0);
  }

  function materialKg(m) {
    return m.kind === 'custom' ? (+m.kgPerUnit || 0) : kgPerUnit(m);
  }

  /* ---------- Формулы: 2*W+2*H, ceil(W/0,5)+1, max(H;2) ---------- */
  var FUNCS = {
    ceil: Math.ceil, floor: Math.floor, round: Math.round,
    max: Math.max, min: Math.min, sqrt: Math.sqrt, abs: Math.abs
  };

  function evalFormula(src, vars) {
    if (typeof src === 'number') return src;
    var s = String(src == null ? '' : src).trim();
    if (!s) return 0;
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
    var i = 0;
    vars = vars || {};

    function ws() { while (s[i] === ' ') i++; }
    function err(msg) { throw new Error(msg + ' (позиция ' + (i + 1) + ')'); }

    function expr() {
      var v = term();
      for (;;) {
        ws();
        if (s[i] === '+') { i++; v += term(); }
        else if (s[i] === '-') { i++; v -= term(); }
        else return v;
      }
    }
    function term() {
      var v = unary();
      for (;;) {
        ws();
        if (s[i] === '*') { i++; v *= unary(); }
        else if (s[i] === '/') {
          i++; var r = unary();
          if (r === 0) err('Деление на ноль');
          v /= r;
        } else return v;
      }
    }
    function unary() {
      ws();
      if (s[i] === '-') { i++; return -unary(); }
      if (s[i] === '+') { i++; return unary(); }
      return power();
    }
    function power() {
      var v = atom(); ws();
      if (s[i] === '^') { i++; return Math.pow(v, unary()); }
      return v;
    }
    function atom() {
      ws();
      var c = s[i];
      if (c === '(') {
        i++; var v = expr(); ws();
        if (s[i] !== ')') err('Не хватает «)»');
        i++; return v;
      }
      var num = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
      if (num) { i += num[0].length; return parseFloat(num[0]); }
      var id = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё_0-9]*/.exec(s.slice(i));
      if (id) {
        var name = id[0]; i += name.length; ws();
        if (s[i] === '(') {
          var fn = FUNCS[name.toLowerCase()];
          if (!fn) err('Неизвестная функция ' + name);
          i++; var args = [];
          ws();
          if (s[i] !== ')') {
            for (;;) {
              args.push(expr()); ws();
              if (s[i] === ';') { i++; continue; }
              break;
            }
          }
          if (s[i] !== ')') err('Не хватает «)»');
          i++; return fn.apply(null, args);
        }
        if (Object.prototype.hasOwnProperty.call(vars, name)) return +vars[name] || 0;
        err('Неизвестный параметр ' + name);
      }
      err(c ? 'Непонятный символ «' + c + '»' : 'Формула оборвалась');
    }

    var out = expr(); ws();
    if (i < s.length) err('Лишний символ «' + s[i] + '»');
    if (!isFinite(out)) err('Результат не число');
    return out;
  }

  function tryFormula(src, vars) {
    try { return { value: evalFormula(src, vars), error: null }; }
    catch (e) { return { value: 0, error: e.message }; }
  }

  /* ---------- Параметры изделия ---------- */
  function paramVars(params, values) {
    var v = {};
    (params || []).forEach(function (p) {
      var x = values && values[p.key] != null && values[p.key] !== '' ? values[p.key] : p.def;
      v[p.key] = parseFloat(String(x).replace(',', '.')) || 0;
    });
    return v;
  }

  /* ---------- Расчёт одной позиции (изделия) ---------- */
  // item: {parts:[{materialId, qty}], params, values, count, laborHours}
  function calcItem(item, materials) {
    var byId = {};
    (materials || []).forEach(function (m) { byId[m.id] = m; });
    var vars = paramVars(item.params, item.values);
    var count = Math.max(0, +item.count || 0);
    var lines = (item.parts || []).map(function (p) {
      var m = byId[p.materialId];
      var q = partQty(p, vars);
      var qty = q.value;
      var base = { part: p, material: m || null, qty: qty, n: q.n, len: q.len };
      if (!m) return Object.assign(base, { kg: 0, cost: 0, error: q.error || 'Материал не найден' });
      return Object.assign(base, { kg: qty * materialKg(m), cost: qty * unitPrice(m), error: q.error });
    });
    var hours = tryFormula(item.laborHours || 0, vars);
    var kgOne = sum(lines, 'kg'), costOne = sum(lines, 'cost');
    // Отходы считаем только на прокат, который режется: не на петли, замки и т.п.
    var cutCost = sum(lines.filter(function (l) { return l.material && l.material.kind !== 'custom'; }), 'cost');
    return {
      lines: lines,
      kgOne: kgOne, costOne: costOne,
      kg: kgOne * count, metalCost: costOne * count, cutCost: cutCost * count,
      hours: hours.value * count,
      errors: lines.filter(function (l) { return l.error; }).length + (hours.error ? 1 : 0)
    };
  }

  // Деталь задаётся либо нарезкой (шт × длина), либо общим количеством
  function hasCut(p) { return p.len != null && String(p.len).trim() !== ''; }
  function partQty(p, vars) {
    if (hasCut(p)) {
      var n = tryFormula(p.n == null || String(p.n).trim() === '' ? 1 : p.n, vars);
      var len = tryFormula(p.len, vars);
      return { value: n.value * len.value, n: n.value, len: len.value, error: n.error || len.error };
    }
    var q = tryFormula(p.qty, vars);
    return { value: q.value, n: null, len: null, error: q.error };
  }

  /* ---------- Карта реза: раскладка деталей по хлыстам ---------- */
  // pieces: [{len (м), label}], stock — длина хлыста, м; kerf — ширина реза, мм.
  // Best Fit Decreasing: каждую деталь (от длинных к коротким) кладём в хлыст с наименьшим остатком.
  function cutPlan(pieces, stock, kerfMm) {
    var kerf = (+kerfMm || 0) / 1000;
    stock = +stock || 6;
    var list = [], joints = 0;
    pieces.forEach(function (p) {
      var len = +p.len || 0;
      if (len <= 0) return;
      // Деталь длиннее хлыста — стыкуем из целых хлыстов и остатка
      while (len > stock + 1e-9) { list.push({ len: stock, label: p.label + ' (часть)' }); len -= stock; joints++; }
      if (len > 1e-6) list.push({ len: len, label: p.label });
    });
    list.sort(function (a, b) { return b.len - a.len; });
    var bars = [];
    list.forEach(function (pc) {
      var best = null;
      bars.forEach(function (b) {
        var need = pc.len + (b.cuts.length ? kerf : 0);
        if (b.rest + 1e-9 >= need && (!best || b.rest < best.rest)) best = b;
      });
      if (!best) { best = { cuts: [], rest: stock }; bars.push(best); }
      best.rest -= pc.len + (best.cuts.length ? kerf : 0);
      best.cuts.push(pc);
    });
    var used = list.reduce(function (a, x) { return a + x.len; }, 0);
    bars.forEach(function (b) { b.rest = Math.max(0, b.rest); });
    return {
      stock: stock, bars: bars, used: used, joints: joints,
      wastePct: bars.length ? (1 - used / (bars.length * stock)) * 100 : 0
    };
  }

  function orderCutPlans(order, materials, s) {
    var byId = {}, groups = {};
    (materials || []).forEach(function (m) { byId[m.id] = m; });
    (order.items || []).forEach(function (it) {
      var vars = paramVars(it.params, it.values), cnt = Math.max(0, Math.round(+it.count || 0));
      (it.parts || []).forEach(function (p) {
        var m = byId[p.materialId];
        if (!m || m.kind === 'sheet' || m.kind === 'custom') return;
        var q = partQty(p, vars);
        if (q.error || q.value <= 0) return;
        var g = groups[m.id] = groups[m.id] || { material: m, pieces: [], uncut: 0 };
        var label = (it.name || 'Изделие') + (p.note ? ': ' + p.note : '');
        if (q.n != null) {
          var n = Math.round(q.n) * cnt;
          for (var i = 0; i < n; i++) g.pieces.push({ len: q.len, label: label });
        } else {
          // Нарезка не задана: считаем общей длиной, режем на хлысты как есть
          for (var k = 0; k < cnt; k++) g.pieces.push({ len: q.value, label: label + ' (без нарезки)' });
          g.uncut += q.value * cnt;
        }
      });
    });
    return Object.keys(groups).map(function (id) {
      var g = groups[id];
      var plan = cutPlan(g.pieces, g.material.stockLen || s.stockLen || 6, s.kerfMm == null ? 3 : s.kerfMm);
      plan.material = g.material; plan.uncut = g.uncut;
      return plan;
    }).sort(function (a, b) { return a.material.name.localeCompare(b.material.name, 'ru', { numeric: true }); });
  }

  /* ---------- Цена по позициям для КП ---------- */
  // Делим итоговую цену пропорционально прямым затратам позиции (металл + работы на кг)
  function allocatePrice(R, order, s) {
    var perKg = (+s.laborPerKg || 0) + (+s.consumablesPerKg || 0) +
      (order.options && order.options.paint ? +s.paintPerKg || 0 : 0) +
      (order.options && order.options.install ? +s.installPerKg || 0 : 0);
    var bases = R.items.map(function (ir) { return ir.metalCost + ir.kg * perKg + ir.hours * (+s.hourRate || 0); });
    var total = bases.reduce(function (a, b) { return a + b; }, 0);
    var step = R.price >= 10000 ? 100 : 1, acc = 0;
    return bases.map(function (b, i) {
      if (i === bases.length - 1) return R.price - acc;
      var v = total ? Math.round(R.price * b / total / step) * step : 0;
      acc += v; return v;
    });
  }

  /* ---------- Деньги: категории, факт по заказу, коэффициенты по факту ---------- */
  var CATEGORIES = [
    { id: 'client', label: 'Оплата от клиента', type: 'income' },
    { id: 'income_other', label: 'Прочий доход', type: 'income' },
    { id: 'metal', label: 'Металл и комплектующие', type: 'expense', plan: ['metal', 'waste'] },
    { id: 'consumables', label: 'Расходники (электроды, диски, газ)', type: 'expense', plan: ['consum'], perKg: 'consumablesPerKg' },
    { id: 'paint', label: 'Грунт и краска', type: 'expense', plan: ['paint'], perKg: 'paintPerKg' },
    { id: 'labor', label: 'Зарплата, сдельная оплата', type: 'expense', plan: ['labor'], perKg: 'laborPerKg' },
    { id: 'install', label: 'Монтаж (бригада, подряд)', type: 'expense', plan: ['install'], perKg: 'installPerKg' },
    { id: 'fuel', label: 'Бензин', type: 'expense', plan: ['fuel'] },
    { id: 'transport', label: 'Доставка, спецтехника, такси', type: 'expense', plan: ['trip'] },
    { id: 'rent', label: 'Аренда', type: 'expense', fixed: true },
    { id: 'utilities', label: 'Свет, связь, коммуналка', type: 'expense', fixed: true },
    { id: 'equipment', label: 'Инструмент и оборудование', type: 'expense', fixed: true },
    { id: 'ads', label: 'Реклама', type: 'expense', fixed: true },
    { id: 'tax', label: 'Налоги, банк, комиссии', type: 'expense', fixed: true },
    { id: 'other', label: 'Прочие расходы', type: 'expense', plan: ['extra'] },
    { id: 'personal', label: 'Личное (не учитывать)', type: 'skip' }
  ];
  var CAT = {};
  CATEGORIES.forEach(function (c) { CAT[c.id] = c; });

  function factByOrder(transactions, orderId) {
    var out = { income: 0, expense: 0, byCat: {} };
    (transactions || []).forEach(function (t) {
      if (t.orderId !== orderId) return;
      var c = CAT[t.category] || CAT.other;
      if (c.type === 'skip') return;
      var a = Math.abs(+t.amount || 0);
      if (c.type === 'income') out.income += a; else { out.expense += a; out.byCat[c.id] = (out.byCat[c.id] || 0) + a; }
    });
    return out;
  }

  // План (строки сметы) против факта (операции, привязанные к заказу), по категориям
  function planVsFact(R, transactions, orderId) {
    var f = factByOrder(transactions, orderId);
    var rows = CATEGORIES.filter(function (c) { return c.type === 'expense'; }).map(function (c) {
      var plan = R.rows.filter(function (r) {
        return (c.plan || []).some(function (k) { return r.key === k || (k === 'extra' && r.key.indexOf('extra') === 0); });
      }).reduce(function (a, r) { return a + r.value; }, 0);
      return { id: c.id, label: c.label, plan: plan, fact: f.byCat[c.id] || 0 };
    }).filter(function (r) { return r.plan || r.fact; });
    var planDirect = rows.reduce(function (a, r) { return a + r.plan; }, 0);
    return {
      rows: rows, planDirect: planDirect, factDirect: f.expense,
      paid: f.income, debt: R.price - f.income,
      planProfit: R.price - planDirect, factProfit: R.price - f.expense
    };
  }

  // Коэффициенты по фактическим расходам за последние N месяцев
  function suggestCoefficients(transactions, orders, s, months, today) {
    today = today || new Date();
    var from = new Date(today.getFullYear(), today.getMonth() - months + 1, 1).toISOString().slice(0, 10);
    var tx = (transactions || []).filter(function (t) { return (t.date || '') >= from; });
    var kg = (orders || []).filter(function (o) {
      return ['в работе', 'сдан'].indexOf(o.status) >= 0 && (o.createdAt || '').slice(0, 10) >= from;
    }).reduce(function (a, o) { return a + (+(o.totals || {}).kg || 0); }, 0);
    var byCat = {};
    tx.forEach(function (t) {
      var c = CAT[t.category];
      if (c && c.type === 'expense') byCat[c.id] = (byCat[c.id] || 0) + Math.abs(+t.amount || 0);
    });
    var out = [];
    CATEGORIES.forEach(function (c) {
      if (c.perKg && byCat[c.id] && kg) {
        out.push({ key: c.perKg, label: c.label + ', на 1 кг', current: +s[c.perKg] || 0, fact: byCat[c.id] / kg });
      }
    });
    if (kg) out.push({ key: 'monthlyKg', label: 'Металла в месяц, кг', current: +s.monthlyKg || 0, fact: kg / months });
    var fixed = CATEGORIES.filter(function (c) { return c.fixed && byCat[c.id]; }).map(function (c) {
      return { name: c.label, amount: Math.round(byCat[c.id] / months) };
    });
    return { from: from, months: months, kg: kg, rows: out, fixedCosts: fixed, byCat: byCat };
  }

  /* ---------- Накладные из постоянных расходов ---------- */
  function overheadPerKg(s) {
    var monthly = sum(s.fixedCosts || [], 'amount');
    var out = +s.monthlyKg || 0;
    return out > 0 ? monthly / out : 0;
  }

  /* ---------- Полный расчёт заказа ---------- */
  function calcOrder(order, materials, s) {
    var items = (order.items || []).map(function (it) { return calcItem(it, materials); });
    var kg = sum(items, 'kg');
    var metalRaw = sum(items, 'metalCost');
    var waste = sum(items, 'cutCost') * (+s.wastePct || 0) / 100;
    var kgGross = kg * (1 + (+s.wastePct || 0) / 100);
    var o = order.options || {};

    var rows = [];
    function add(key, label, value, hint) { if (value) rows.push({ key: key, label: label, value: value, hint: hint || '' }); }

    add('metal', 'Металл', metalRaw, fmtNum(kg, 1) + ' кг');
    add('waste', 'Обрезки и отходы', waste, (s.wastePct || 0) + '%');
    add('consum', 'Расходники (электроды, диски, газ)', kgGross * (+s.consumablesPerKg || 0), fmtNum(s.consumablesPerKg) + '/кг');
    if (o.paint) add('paint', 'Грунт и покраска', kgGross * (+s.paintPerKg || 0), fmtNum(s.paintPerKg) + '/кг');

    var hours = sum(items, 'hours');
    var labor = kg * (+s.laborPerKg || 0) + hours * (+s.hourRate || 0);
    add('labor', 'Работа (изготовление)', labor,
      fmtNum(s.laborPerKg) + '/кг' + (hours ? ' + ' + fmtNum(hours, 1) + ' ч' : ''));
    if (o.install) {
      add('install', 'Монтаж', kg * (+s.installPerKg || 0) + (+o.installExtra || 0), fmtNum(s.installPerKg) + '/кг');
    }

    var trips = +o.trips || 0, km = +o.distanceKm || 0;
    var fuel = trips * km * 2 / 100 * (+s.fuelPer100 || 0) * (+s.fuelPrice || 0);
    add('fuel', 'Бензин', fuel, trips ? trips + ' рейс × ' + km + ' км туда-обратно' : '');
    add('trip', 'Выезды (амортизация, время)', trips * (+s.tripFixed || 0), trips ? trips + ' × ' + fmtNum(s.tripFixed) : '');

    var ohk = overheadPerKg(s);
    add('overhead', 'Постоянные расходы (аренда, свет и т.д.)', kg * ohk, fmtNum(ohk, 0) + '/кг');

    (order.extras || []).forEach(function (e, idx) {
      add('extra' + idx, e.name || 'Прочее', +e.amount || 0, 'доп.');
    });

    var cost = sum(rows, 'value');
    var marginPct = o.marginPct != null && o.marginPct !== '' ? +o.marginPct : (+s.marginPct || 0);
    var margin = cost * marginPct / 100;
    var beforeDiscount = cost + margin;
    var discount = beforeDiscount * (+o.discountPct || 0) / 100;
    var price = roundTo(beforeDiscount - discount, +s.roundTo || 1);

    return {
      items: items, rows: rows, kg: kg, kgGross: kgGross,
      cost: cost, marginPct: marginPct, margin: margin, discount: discount,
      price: price, profit: price - cost,
      pricePerKg: kg ? price / kg : 0,
      errors: sum(items, 'errors')
    };
  }

  /* ---------- Утилиты ---------- */
  function sum(arr, key) { return (arr || []).reduce(function (a, x) { return a + (+x[key] || 0); }, 0); }
  function roundTo(v, step) { return step > 1 ? Math.ceil(v / step) * step : Math.round(v); }
  function fmtNum(v, digits) {
    v = +v || 0;
    var d = digits == null ? (Math.abs(v) < 10 && v % 1 ? 2 : 0) : digits;
    return v.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  /* ---------- Базовый каталог и настройки (примерные цены, Казахстан) ---------- */
  function mat(id, name, kind, dims, price, priceMode, extra) {
    var m = { id: id, name: name, kind: kind, dims: dims || {}, price: price, priceMode: priceMode || 'unit', unit: unitOf(kind) || 'шт' };
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  }

  var DEFAULT_MATERIALS = [
    mat('p20x20x2', 'Профтруба 20×20×2', 'square', { a: 20, t: 2 }, 420, 'kg'),
    mat('p40x20x2', 'Профтруба 40×20×2', 'rect', { a: 40, b: 20, t: 2 }, 420, 'kg'),
    mat('p40x40x2', 'Профтруба 40×40×2', 'square', { a: 40, t: 2 }, 420, 'kg'),
    mat('p60x40x2', 'Профтруба 60×40×2', 'rect', { a: 60, b: 40, t: 2 }, 420, 'kg'),
    mat('p60x60x3', 'Профтруба 60×60×3', 'square', { a: 60, t: 3 }, 420, 'kg'),
    mat('p80x80x3', 'Профтруба 80×80×3', 'square', { a: 80, t: 3 }, 420, 'kg'),
    mat('p100x100x4', 'Профтруба 100×100×4', 'square', { a: 100, t: 4 }, 430, 'kg'),
    mat('r57x3', 'Труба круглая 57×3', 'round', { d: 57, t: 3 }, 430, 'kg'),
    mat('r108x4', 'Труба круглая 108×4', 'round', { d: 108, t: 4 }, 430, 'kg'),
    mat('ug50x5', 'Уголок 50×50×5', 'angle', { a: 50, b: 50, t: 5 }, 410, 'kg'),
    mat('sheet2', 'Лист 2 мм', 'sheet', { t: 2 }, 440, 'kg'),
    mat('sheet3', 'Лист 3 мм', 'sheet', { t: 3 }, 440, 'kg'),
    mat('arm12', 'Арматура Ø12', 'rod', { d: 12 }, 380, 'kg'),
    mat('prof045', 'Профнастил С8 0,45', 'custom', {}, 2900, 'unit', { unit: 'м²', kgPerUnit: 4.6 }),
    mat('hinge', 'Петля гаражная', 'custom', {}, 1500, 'unit', { unit: 'шт', kgPerUnit: 0.4 }),
    mat('lock', 'Замок врезной', 'custom', {}, 9000, 'unit', { unit: 'шт', kgPerUnit: 0 }),
    mat('anchor', 'Анкер / закладная', 'custom', {}, 600, 'unit', { unit: 'шт', kgPerUnit: 0.3 })
  ];

  var DEFAULT_SETTINGS = {
    currency: '₸',
    wastePct: 7,
    consumablesPerKg: 40,
    paintPerKg: 60,
    laborPerKg: 350,
    hourRate: 3000,
    installPerKg: 150,
    fuelPrice: 240,
    fuelPer100: 14,
    tripFixed: 3000,
    marginPct: 25,
    roundTo: 500,
    monthlyKg: 6000,
    fixedCosts: [
      { name: 'Аренда цеха', amount: 350000 },
      { name: 'Электроэнергия', amount: 80000 },
      { name: 'Связь, реклама', amount: 40000 },
      { name: 'Амортизация оборудования', amount: 50000 }
    ],
    stockLen: 6,
    kerfMm: 3,
    company: 'Мой цех',
    phone: '',
    address: '',
    bin: '',
    leadDays: 10,
    validDays: 7,
    payTerms: 'Предоплата 70% на металл, остаток после монтажа',
    warranty: 'Гарантия на сварные швы 12 месяцев'
  };

  var DEFAULT_TEMPLATES = [
    {
      id: 'tpl-gate', name: 'Ворота распашные с профнастилом', category: 'Ворота',
      params: [{ key: 'W', label: 'Ширина проёма, м', def: 3.5 }, { key: 'H', label: 'Высота, м', def: 2 }],
      parts: [
        { materialId: 'p60x40x2', n: '4', len: 'H', note: 'стойки створок' },
        { materialId: 'p60x40x2', n: '4', len: 'W/2', note: 'перемычки створок' },
        { materialId: 'p40x20x2', n: '2', len: 'W/2', note: 'обрешётка, горизонт' },
        { materialId: 'p40x20x2', n: '2', len: 'H', note: 'обрешётка, раскосы' },
        { materialId: 'p40x20x2', n: '2', len: 'W/2', note: 'обрешётка, низ' },
        { materialId: 'p80x80x3', n: '2', len: 'H+1', note: 'столбы с заглублением 1 м' },
        { materialId: 'prof045', qty: 'W*H*1.1', note: 'обшивка +10% на нахлёст' },
        { materialId: 'hinge', qty: '4', note: '' }
      ],
      laborHours: '0'
    },
    {
      id: 'tpl-canopy', name: 'Навес односкатный', category: 'Навесы',
      params: [{ key: 'L', label: 'Длина, м', def: 6 }, { key: 'B', label: 'Вынос, м', def: 4 }, { key: 'H', label: 'Высота столбов, м', def: 2.7 }],
      parts: [
        { materialId: 'p80x80x3', n: '(ceil(L/3)+1)*2', len: 'H+0.8', note: 'столбы, шаг 3 м' },
        { materialId: 'p60x40x2', n: '2', len: 'L', note: 'прогоны по столбам' },
        { materialId: 'p40x20x2', n: 'ceil(L/0.8)+1', len: 'B', note: 'обрешётка шаг 0,8 м' },
        { materialId: 'prof045', qty: 'L*B*1.1', note: 'кровля' },
        { materialId: 'anchor', qty: '(ceil(L/3)+1)*2', note: '' }
      ],
      laborHours: '0'
    },
    {
      id: 'tpl-railing', name: 'Перила лестницы', category: 'Ограждения',
      params: [{ key: 'L', label: 'Длина, м', def: 4 }],
      parts: [
        { materialId: 'p40x40x2', n: '1', len: 'L', note: 'поручень' },
        { materialId: 'p40x40x2', n: 'ceil(L/1)+1', len: '0.9', note: 'стойки шаг 1 м' },
        { materialId: 'p20x20x2', n: 'ceil(L/0.12)', len: '0.8', note: 'балясины шаг 12 см' }
      ],
      laborHours: '0'
    }
  ];

  var api = {
    kgPerUnit: kgPerUnit, materialKg: materialKg, unitPrice: unitPrice, unitOf: unitOf,
    evalFormula: evalFormula, tryFormula: tryFormula, paramVars: paramVars,
    calcItem: calcItem, calcOrder: calcOrder, overheadPerKg: overheadPerKg,
    hasCut: hasCut, partQty: partQty, cutPlan: cutPlan, orderCutPlans: orderCutPlans, allocatePrice: allocatePrice,
    CATEGORIES: CATEGORIES, CAT: CAT, factByOrder: factByOrder, planVsFact: planVsFact, suggestCoefficients: suggestCoefficients,
    fmtNum: fmtNum, roundTo: roundTo,
    DEFAULT_MATERIALS: DEFAULT_MATERIALS, DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_TEMPLATES: DEFAULT_TEMPLATES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetalCalc = api;
})(this);
