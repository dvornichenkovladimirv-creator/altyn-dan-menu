/* Интерфейс калькулятора. Данные: облачная база артефакта (db), иначе localStorage. */
(function () {
  'use strict';
  var C = window.MetalCalc;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var uid = function (p) { return (p || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var n0 = function (v) { return C.fmtNum(v, 0); };

  var S = { settings: clone(C.DEFAULT_SETTINGS), materials: [], templates: [], orders: [], transactions: [] };
  var draft = null;
  var view = 'calc';
  var editTpl = null;
  var caps = { db: null, sample: null, downloads: null, images: false };
  var storeMode = 'local';
  var ready = { materials: false, templates: false, orders: false, transactions: false, settings: false };

  /* ================= Хранилище ================= */
  var LS_KEY = 'metalcalc.v1', LS_DRAFT = 'metalcalc.draft';
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } }

  var Store = {
    put: function (coll, obj) {
      if (storeMode === 'db') {
        return caps.db.collection(coll).doc(obj.id).set(clone(obj)).catch(dbError);
      }
      var list = S[coll], i = list.findIndex(function (x) { return x.id === obj.id; });
      if (i < 0) list.push(obj); else list[i] = obj;
      saveLocal();
    },
    remove: function (coll, id) {
      // Позицию из прайса поставщика не удаляем, а скрываем отметкой
      if (storeMode === 'db' && coll === 'materials' && fromPricelist(id)) {
        return caps.db.collection(coll).doc(id).set({ id: id, deleted: true }).catch(dbError);
      }
      if (storeMode === 'db') return caps.db.collection(coll).doc(id).delete().catch(dbError);
      S[coll] = S[coll].filter(function (x) { return x.id !== id; });
      saveLocal();
    },
    saveSettings: function () {
      if (storeMode === 'db') return caps.db.doc('config/settings').set(clone(S.settings)).catch(dbError);
      saveLocal();
    }
  };
  function saveLocal() { lsSet(LS_KEY, S); }
  function dbError(e) { toast('Не сохранилось: ' + (e && e.message || 'ошибка базы'), true); }

  var timers = {};
  function later(key, fn, ms) { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms == null ? 500 : ms); }

  function loadLocal() {
    var saved = lsGet(LS_KEY);
    if (saved && saved.materials) {
      S = saved;
      S.transactions = S.transactions || [];
      S.settings = Object.assign(clone(C.DEFAULT_SETTINGS), saved.settings || {});
    } else {
      S.materials = clone(C.DEFAULT_MATERIALS);
      S.templates = clone(C.DEFAULT_TEMPLATES);
      saveLocal();
    }
  }

  /* Каталог = позиции из прайсов поставщиков + свои материалы и правки поверх них.
     Своя правка позиции из прайса действует, пока не придёт более свежий прайс этого поставщика. */
  var own = [], pricelists = [];
  function fromPricelist(id) { return pricelists.some(function (pl) { return (pl.items || []).some(function (it) { return it.id === id; }); }); }
  function mergeMaterials() {
    var map = {}, order = [];
    pricelists.forEach(function (pl) {
      (pl.items || []).forEach(function (it) {
        if (!map[it.id]) order.push(it.id);
        map[it.id] = Object.assign({ supplier: pl.supplier, priceDate: pl.priceDate }, it);
      });
    });
    own.forEach(function (m) {
      var base = map[m.id];
      if (m.deleted) { map[m.id] = null; return; }
      if (base && m.supplier === base.supplier && (m.priceDate || '') < (base.priceDate || '')) return;
      if (!base) order.push(m.id);
      map[m.id] = Object.assign({}, base || {}, m);
    });
    S.materials = order.map(function (id) { return map[id]; }).filter(Boolean);
  }

  function connectDb() {
    storeMode = 'db';
    caps.db.collection('pricelists').onSnapshot(function (snap) {
      pricelists = snap.docs.map(function (d) { return d.data(); });
      mergeMaterials(); onRemoteChange();
    });
    ['materials', 'templates', 'orders', 'transactions'].forEach(function (coll) {
      caps.db.collection(coll).onSnapshot(function (snap) {
        if (coll === 'materials') { own = snap.docs.map(function (d) { return d.data(); }); mergeMaterials(); }
        else S[coll] = snap.docs.map(function (d) { return d.data(); });
        if (coll === 'orders') S.orders.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
        if (coll === 'transactions') sortTx();
        ready[coll] = true;
        onRemoteChange();
      }, function () { toast('Нет доступа к базе — работаю локально', true); });
    });
    caps.db.doc('config/settings').onSnapshot(function (snap) {
      if (snap.exists) S.settings = Object.assign(clone(C.DEFAULT_SETTINGS), snap.data());
      ready.settings = true;
      onRemoteChange();
    });
  }

  // Перерисовываем только то, что не редактируется прямо сейчас, чтобы не сбить курсор
  function onRemoteChange() {
    var a = document.activeElement;
    if (a && a.matches && a.matches('input, textarea, select') && a.closest('#view')) {
      later('remote', onRemoteChange, 1500);
      return;
    }
    render();
  }

  function seedDefaults() {
    var b = caps.db;
    var jobs = C.DEFAULT_MATERIALS.map(function (m) { return b.collection('materials').doc(m.id).set(clone(m)); })
      .concat(C.DEFAULT_TEMPLATES.map(function (t) { return b.collection('templates').doc(t.id).set(clone(t)); }))
      .concat([b.doc('config/settings').set(clone(C.DEFAULT_SETTINGS))]);
    Promise.all(jobs).then(function () { toast('Базовый каталог загружен'); }).catch(dbError);
  }

  /* ================= Черновик расчёта ================= */
  function newDraft() {
    return {
      id: uid('ord'), number: '', client: '', phone: '', address: '', note: '',
      status: 'расчёт', items: [], extras: [],
      options: { paint: true, install: true, trips: 1, distanceKm: 15, marginPct: '', discountPct: 0 }
    };
  }
  function saveDraft() { lsSet(LS_DRAFT, draft); }

  function itemFromTemplate(t, values) {
    var it = clone(t);
    it.id = uid('it'); it.templateId = t.id;
    it.values = values || {};
    (t.params || []).forEach(function (p) { if (it.values[p.key] == null) it.values[p.key] = p.def; });
    it.count = 1;
    delete it.category;
    return it;
  }

  function itemTitle(it) {
    var ps = (it.params || []).map(function (p) { return C.fmtNum(C.paramVars(it.params, it.values)[p.key], 2); });
    return it.name + (ps.length ? ' ' + ps.join('×') : '');
  }

  /* ================= Рендер ================= */
  function render() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
    });
    var html = view === 'calc' ? viewCalc()
      : view === 'orders' ? viewOrders()
      : view === 'templates' ? (editTpl ? viewTplEdit() : viewTemplates())
      : view === 'materials' ? viewMaterials()
      : view === 'money' ? viewMoney()
      : viewSettings();
    $('#view').innerHTML = banner() + html;
    if (view === 'calc') refreshCalc();
    if (view === 'templates' && editTpl) refreshTpl();
    $('#store-mode').textContent = storeMode === 'db' ? 'Облако: данные общие для всех ваших устройств' : 'Данные хранятся в этом браузере';
  }

  function banner() {
    if (storeMode === 'db' && ready.materials && ready.settings && !S.materials.length) {
      return '<div class="notice"><div><strong>База пуста.</strong> Загрузите базовый каталог: 17 видов металла, 3 шаблона и примерные коэффициенты. Потом поправьте цены под себя.</div>' +
        '<button class="btn primary" data-action="seed">Загрузить каталог</button></div>';
    }
    return '';
  }

  function cur() { return esc(S.settings.currency || '₸'); }
  function money(v) { return n0(v) + ' ' + cur(); }

  function materialOptions(sel) {
    var groups = {};
    S.materials.forEach(function (m) { var g = kindLabel(m.kind) + (m.supplier ? ' · ' + m.supplier : ''); (groups[g] = groups[g] || []).push(m); });
    var out = '<option value="">— выберите —</option>';
    Object.keys(groups).forEach(function (g) {
      out += '<optgroup label="' + esc(g) + '">' + groups[g].sort(function (a, b) { return a.name.localeCompare(b.name, 'ru', { numeric: true }); }).map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    return out;
  }

  var KINDS = { rect: 'Труба профильная', square: 'Труба квадратная', round: 'Труба круглая', angle: 'Уголок', strip: 'Полоса', rod: 'Круг / арматура', profile: 'Швеллер, двутавр (вес вручную)', sheet: 'Лист', custom: 'Прочее (вес и цена вручную)' };
  function kindLabel(k) { return KINDS[k] || KINDS.custom; }

  /* ---------- Расчёт ---------- */
  function viewCalc() {
    var d = draft, o = d.options;
    var tplOpts = S.templates.slice().sort(function (a, b) { return (a.category || '').localeCompare(b.category || '', 'ru'); })
      .map(function (t) { return '<option value="' + esc(t.id) + '">' + esc((t.category ? t.category + ' · ' : '') + t.name) + '</option>'; }).join('');

    var items = d.items.map(function (it, i) { return itemCard(it, i); }).join('');
    if (!d.items.length) {
      items = '<div class="empty">Добавьте первое изделие: выберите шаблон, загрузите фото или эскиз, или соберите из деталей вручную.</div>';
    }

    return '<div class="calc">' +
      '<div class="calc-main">' +
        '<section class="panel">' +
          '<div class="panel-head"><h2>' + (d.number ? 'Заказ № ' + esc(d.number) : 'Новый расчёт') + '</h2>' +
            '<button class="btn ghost" data-action="new-draft">Начать заново</button></div>' +
          '<div class="grid4">' +
            field('Клиент', '<input id="d-client" data-bind="client" value="' + esc(d.client) + '" placeholder="Имя или компания">') +
            field('Телефон', '<input id="d-phone" data-bind="phone" value="' + esc(d.phone) + '" inputmode="tel">') +
            field('Адрес объекта', '<input id="d-address" data-bind="address" value="' + esc(d.address) + '">') +
            field('Статус', '<select id="d-status" data-bind="status">' + ['расчёт', 'согласован', 'в работе', 'сдан', 'отказ'].map(function (s) {
              return '<option' + (s === d.status ? ' selected' : '') + '>' + s + '</option>';
            }).join('') + '</select>') +
          '</div>' +
        '</section>' +

        '<section class="add-bar">' +
          '<div class="add-tpl">' +
            '<label for="add-tpl" class="lbl">Из шаблона</label>' +
            '<div class="row"><select id="add-tpl">' + tplOpts + '</select>' +
            '<button class="btn primary" data-action="add-tpl">Добавить</button></div>' +
          '</div>' +
          '<div class="add-alt">' +
            '<button class="btn" data-action="ai-open"' + (caps.sample ? '' : ' disabled title="Доступно в облачной версии на claude.ai"') + '>По фото или описанию</button>' +
            '<button class="btn" data-action="add-blank">Собрать вручную</button>' +
          '</div>' +
        '</section>' +
        aiPanel() + kpPanel() +
        '<div class="items">' + items + '</div>' +

        '<section class="panel">' +
          '<h3>Работы и выезды</h3>' +
          '<div class="grid4">' +
            check('o-paint', 'options.paint', o.paint, 'Грунт и покраска') +
            check('o-install', 'options.install', o.install, 'Монтаж на объекте') +
            field('Рейсов на объект', '<input id="o-trips" type="number" min="0" step="1" data-bind="options.trips" data-num value="' + esc(o.trips) + '">') +
            field('Расстояние в одну сторону, км', '<input id="o-km" type="number" min="0" data-bind="options.distanceKm" data-num value="' + esc(o.distanceKm) + '">') +
            field('Наценка, % (пусто = ' + esc(S.settings.marginPct) + ')', '<input id="o-margin" type="number" data-bind="options.marginPct" value="' + esc(o.marginPct) + '">') +
            field('Скидка клиенту, %', '<input id="o-disc" type="number" min="0" max="100" data-bind="options.discountPct" data-num value="' + esc(o.discountPct) + '">') +
            field('Монтаж: доп. сумма', '<input id="o-instx" type="number" min="0" data-bind="options.installExtra" data-num value="' + esc(o.installExtra || '') + '">') +
          '</div>' +
          '<h3>Прочие расходы по заказу</h3>' +
          '<div class="extras">' + d.extras.map(function (e, i) {
            return '<div class="row">' +
              '<input id="ex-n-' + i + '" data-bind="extras.' + i + '.name" value="' + esc(e.name) + '" placeholder="Например: аренда автовышки">' +
              '<input id="ex-a-' + i + '" class="num" type="number" data-bind="extras.' + i + '.amount" data-num value="' + esc(e.amount) + '" placeholder="Сумма">' +
              '<button class="icon" data-action="del-extra" data-i="' + i + '" aria-label="Удалить">×</button></div>';
          }).join('') + '</div>' +
          '<button class="btn ghost" data-action="add-extra">+ расход</button>' +
          field('Заметка', '<textarea id="d-note" rows="2" data-bind="note">' + esc(d.note) + '</textarea>') +
        '</section>' +

        '<section class="panel"><h3>Что закупить</h3><div id="buy" class="scroll"></div></section>' +
        '<section class="panel"><div class="panel-head"><h3>Карта реза</h3><button class="btn ghost" data-action="copy-cut">Скопировать для мастера</button></div>' +
          '<p class="muted">Детали разложены по хлыстам так, чтобы осталось меньше обрезков. Рез ' + esc(S.settings.kerfMm) + ' мм учтён. Длина хлыста задаётся в «Металл и цены».</p>' +
          '<div id="cutmap"></div></section>' +
        (orderExists(draft.id) ? planFactPanel() : '') +
      '</div>' +
      '<aside class="summary" id="summary"></aside>' +
    '</div>';
  }

  function itemCard(it, i) {
    var params = (it.params || []).map(function (p) {
      return field(p.label || p.key, '<input id="it-' + i + '-p-' + esc(p.key) + '" type="text" inputmode="decimal" class="num" data-bind="items.' + i + '.values.' + esc(p.key) + '" value="' + esc(it.values && it.values[p.key] != null ? it.values[p.key] : p.def) + '">');
    }).join('');
    var parts = (it.parts || []).map(function (p, j) {
      return '<tr>' +
        '<td><select id="it-' + i + '-m-' + j + '" data-bind="items.' + i + '.parts.' + j + '.materialId" data-struct>' + materialOptions(p.materialId) + '</select></td>' +
        '<td><input id="it-' + i + '-n-' + j + '" class="formula xs" data-bind="items.' + i + '.parts.' + j + '.n" value="' + esc(p.n) + '" placeholder="шт"></td>' +
        '<td><input id="it-' + i + '-l-' + j + '" class="formula sm" data-bind="items.' + i + '.parts.' + j + '.len" value="' + esc(p.len) + '" placeholder="м"></td>' +
        '<td><input id="it-' + i + '-q-' + j + '" class="formula" data-bind="items.' + i + '.parts.' + j + '.qty" value="' + esc(C.hasCut(p) ? '' : p.qty) + '"' + (C.hasCut(p) ? ' disabled' : '') + '></td>' +
        '<td class="unit" data-out="u-' + i + '-' + j + '"></td>' +
        '<td class="num" data-out="kg-' + i + '-' + j + '"></td>' +
        '<td class="num" data-out="c-' + i + '-' + j + '"></td>' +
        '<td><input id="it-' + i + '-t-' + j + '" data-bind="items.' + i + '.parts.' + j + '.note" value="' + esc(p.note) + '" placeholder="примечание"></td>' +
        '<td><button class="icon" data-action="del-part" data-i="' + i + '" data-j="' + j + '" aria-label="Удалить деталь">×</button></td>' +
      '</tr>';
    }).join('');
    var hint = 'Труба: шт × длина — для карты реза. Лист и штучное — в «всего».' +
      ((it.params || []).length ? ' Параметры: ' + it.params.map(function (p) { return '<code>' + esc(p.key) + '</code>'; }).join(', ') : '');

    return '<article class="item">' +
      '<div class="item-head">' +
        '<input id="it-' + i + '-name" class="item-name" data-bind="items.' + i + '.name" value="' + esc(it.name) + '" aria-label="Название изделия">' +
        '<label class="count">×<input id="it-' + i + '-count" type="number" min="1" data-bind="items.' + i + '.count" data-num value="' + esc(it.count) + '" aria-label="Количество"> шт</label>' +
      '</div>' +
      (it.aiNote ? '<div class="ai-note">' + esc(it.aiNote) + '</div>' : '') +
      (params ? '<div class="params">' + params + '</div>' : '') +
      '<div class="scroll"><table class="parts"><thead><tr><th>Материал</th><th>Шт</th><th>Длина, м</th><th>или всего</th><th>ед.</th><th class="num">кг</th><th class="num">' + cur() + '</th><th>Примечание</th><th></th></tr></thead>' +
      '<tbody>' + parts + '</tbody></table></div>' +
      '<div class="item-foot">' +
        '<span class="hint">' + hint + '</span>' +
        '<label class="hours">Работа сварщика, ' + cur() + ' <input id="it-' + i + '-w" class="formula" data-bind="items.' + i + '.laborCost" value="' + esc(it.laborCost || '') + '" placeholder="L*4000"></label>' +
        '<span class="work-out" data-out="w-' + i + '"></span>' +
        '<span class="item-total" data-out="it-' + i + '"></span>' +
      '</div>' +
      '<div class="item-actions">' +
        '<button class="btn ghost" data-action="add-part" data-i="' + i + '">+ деталь</button>' +
        '<button class="btn ghost" data-action="item-to-tpl" data-i="' + i + '">' + (it.templateId ? 'Обновить шаблон' : 'Сохранить как шаблон') + '</button>' +
        '<button class="btn ghost" data-action="dup-item" data-i="' + i + '">Копия</button>' +
        '<button class="btn ghost danger" data-action="del-item" data-i="' + i + '">Удалить</button>' +
      '</div>' +
    '</article>';
  }

  function refreshCalc() {
    var R = C.calcOrder(draft, S.materials, S.settings);
    R.items.forEach(function (ir, i) {
      ir.lines.forEach(function (l, j) {
        var qel = document.getElementById('it-' + i + '-q-' + j);
        if (qel) {
          var cut = C.hasCut(l.part);
          if (cut) { qel.disabled = true; qel.value = l.error ? '' : C.fmtNum(l.qty, 2); }
          else if (qel.disabled) { qel.disabled = false; qel.value = l.part.qty || ''; }
        }
        setOut('u-' + i + '-' + j, l.material ? l.material.unit : '');
        setOut('kg-' + i + '-' + j, l.error ? '<span class="err" title="' + esc(l.error) + '">ошибка</span>' : C.fmtNum(l.kg, 1));
        setOut('c-' + i + '-' + j, l.error ? '' : n0(l.cost) + '<small>' + C.fmtNum(l.qty, 2) + ' ' + esc(l.material ? l.material.unit : '') + '</small>');
      });
      setOut('w-' + i, ir.workOne ? '= ' + money(ir.workOne) : '');
      setOut('it-' + i, C.fmtNum(ir.kg, 1) + ' кг · металл ' + money(ir.metalCost) + (ir.work ? ' · работа ' + money(ir.work) : ''));
    });

    var rows = R.rows.map(function (r) {
      return '<div class="srow"><span>' + esc(r.label) + (r.hint ? '<small>' + esc(r.hint) + '</small>' : '') + '</span><b>' + n0(r.value) + '</b></div>';
    }).join('');
    $('#summary').innerHTML =
      '<div class="price-block">' +
        '<div class="lbl">Цена для клиента</div>' +
        '<div class="price">' + n0(R.price) + '<span>' + cur() + '</span></div>' +
        '<div class="kpis">' +
          kpi('Вес', C.fmtNum(R.kg, 1) + ' кг') +
          kpi('За кг', n0(R.pricePerKg) + ' ' + cur()) +
          kpi('Прибыль', n0(R.profit) + ' ' + cur(), R.profit < 0 ? 'bad' : 'good') +
        '</div>' +
        (R.errors ? '<div class="warn">Есть ошибки в формулах: ' + R.errors + '. Наведите на «ошибка», чтобы увидеть причину.</div>' : '') +
      '</div>' +
      '<div class="breakdown">' + (rows || '<div class="muted">Пока нечего считать</div>') +
        '<div class="srow total"><span>Себестоимость</span><b>' + n0(R.cost) + '</b></div>' +
        '<div class="srow"><span>Наценка<small>' + C.fmtNum(R.marginPct, 1) + '%</small></span><b>' + n0(R.margin) + '</b></div>' +
        (R.discount ? '<div class="srow"><span>Скидка</span><b>−' + n0(R.discount) + '</b></div>' : '') +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn primary" data-action="save-order">' + (orderExists(draft.id) ? 'Сохранить изменения' : 'Сохранить заказ') + '</button>' +
        '<button class="btn" data-action="kp-open">Коммерческое предложение</button>' +
        '<button class="btn" data-action="copy-kp">Скопировать КП для WhatsApp</button>' +
        (caps.downloads ? '<button class="btn" data-action="csv">Скачать смету (CSV)</button>' : '') +
      '</div>';

    var plans = C.orderCutPlans(draft, S.materials, S.settings);
    refreshCut(plans);
    refreshPlanFact(R);
    if (kpOpen) { var kd = $('#kp-preview'); if (kd) kd.innerHTML = kpDoc(R); }
    var buy = buyList(R, plans);
    $('#buy').innerHTML = buy.length ? '<table class="data"><thead><tr><th>Материал</th><th class="num">Нужно</th><th class="num">' + (S.settings.wholeBars ? 'Купить' : 'С запасом ' + esc(S.settings.wastePct) + '%') + '</th><th class="num">кг</th><th class="num">' + cur() + '</th></tr></thead><tbody>' +
      buy.map(function (b) {
        return '<tr><td>' + esc(b.name) + '</td><td class="num">' + C.fmtNum(b.qty, 2) + ' ' + esc(b.unit) + '</td><td class="num">' + C.fmtNum(b.qtyW, 2) + ' ' + esc(b.unit) +
          (b.bars ? '<small>' + b.bars + ' хлыст. по ' + C.fmtNum(b.stock, 2) + ' м (по карте реза)</small>' : '') + '</td><td class="num">' + C.fmtNum(b.kg, 1) + '</td><td class="num">' + n0(b.cost) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="muted">Здесь появится сводка металла по всем изделиям — список для закупки.</div>';
  }

  function buyList(R, plans) {
    var byMat = {};
    (plans || C.orderCutPlans(draft, S.materials, S.settings)).forEach(function (p) { byMat[p.material.id] = p; });
    var acc = {};
    R.items.forEach(function (ir, i) {
      var cnt = +draft.items[i].count || 0;
      ir.lines.forEach(function (l) {
        if (!l.material || l.error) return;
        var a = acc[l.material.id] = acc[l.material.id] || { name: l.material.name, unit: l.material.unit, qty: 0, kg: 0, cost: 0, kind: l.material.kind };
        a.qty += l.qty * cnt; a.kg += l.kg * cnt; a.cost += l.cost * cnt;
      });
    });
    var w = 1 + (+S.settings.wastePct || 0) / 100;
    return Object.keys(acc).map(function (k) {
      var a = acc[k]; a.qtyW = a.kind === 'custom' ? a.qty : a.qty * w;
      if (byMat[k]) {
        a.bars = byMat[k].bars.length; a.stock = byMat[k].stock; a.qtyW = Math.max(a.qty, a.bars * a.stock);
        if (S.settings.wholeBars) a.cost = a.bars * a.stock * C.unitPrice(byMat[k].material);
      }
      return a;
    }).sort(function (a, b) { return b.kg - a.kg; });
  }

  function setOut(key, html) { var el = document.querySelector('[data-out="' + key + '"]'); if (el) el.innerHTML = html; }
  function kpi(l, v, cls) { return '<div class="kpi ' + (cls || '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; }
  function field(label, control) {
    var id = (/id="([^"]+)"/.exec(control) || [])[1];
    return '<div class="field"><label class="lbl"' + (id ? ' for="' + id + '"' : '') + '>' + esc(label) + '</label>' + control + '</div>';
  }
  function check(id, bind, val, label) {
    return '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" data-bind="' + bind + '"' + (val ? ' checked' : '') + '> ' + esc(label) + '</label>';
  }
  function orderExists(id) { return S.orders.some(function (o) { return o.id === id; }); }

  /* ---------- Распознавание по фото / описанию ---------- */
  var aiOpen = false, aiBusy = false, aiFile = null;
  function aiPanel() {
    if (!aiOpen) return '';
    return '<section class="panel ai">' +
      '<div class="panel-head"><h3>Распознать изделие</h3><button class="icon" data-action="ai-close" aria-label="Закрыть">×</button></div>' +
      '<p class="muted">Загрузите фото, эскиз или чертёж и добавьте пару слов: размеры, профиль, что важно. Если похоже на ваш шаблон, возьмём его; если нет, соберём список деталей из вашего каталога. Всё можно поправить перед сохранением.</p>' +
      (caps.images ? '<label class="drop" for="ai-file"><input type="file" id="ai-file" accept="image/*"><span id="ai-file-name">' + (aiFile ? esc(aiFile.name) : 'Выбрать фото или эскиз') + '</span></label>' : '') +
      field('Описание', '<textarea id="ai-text" rows="3" placeholder="Например: ворота откатные 4×2 м, рама 60×40, обшивка профнастил, 2 столба 100×100"></textarea>') +
      '<div class="row"><button class="btn primary" data-action="ai-run"' + (aiBusy ? ' disabled' : '') + '>' + (aiBusy ? 'Считаю…' : 'Распознать и добавить') + '</button><span id="ai-status" class="muted"></span></div>' +
    '</section>';
  }

  function runAi() {
    var text = ($('#ai-text') || {}).value || '';
    if (!aiFile && !text.trim()) { $('#ai-status').textContent = 'Добавьте фото или описание.'; return; }
    aiBusy = true; render();
    var catalog = S.materials.map(function (m) {
      return m.id + ' | ' + m.name + ' | ед.: ' + m.unit + ' | ' + C.fmtNum(C.materialKg(m), 2) + ' кг/ед.';
    }).join('\n');
    var tpls = S.templates.map(function (t) {
      return t.id + ' | ' + t.name + ' | параметры: ' + (t.params || []).map(function (p) { return p.key + ' (' + p.label + ')'; }).join(', ') +
        ' | детали: ' + (t.parts || []).map(function (p) { return p.materialId + ' = ' + p.qty; }).join('; ');
    }).join('\n');
    var prompt =
      'Ты сметчик цеха металлоконструкций. Определи изделие по ' + (aiFile ? 'изображению и ' : '') + 'описанию и посчитай расход металла.\n\n' +
      'Описание от мастера: ' + (text.trim() || '(нет)') + '\n\n' +
      'ШАБЛОНЫ цеха (id | название | параметры | детали с формулами):\n' + (tpls || '(нет)') + '\n\n' +
      'КАТАЛОГ материалов (id | название | единица | вес):\n' + catalog + '\n\n' +
      'Правила:\n' +
      '- Мастер называет трубы условно: «51-я» = Ø50,8; «38-я» = Ø38,1; «32-я» = Ø31,8; «25-я» = Ø25; «16-я» = Ø15,9; «19-я» = Ø19; «63-я» = Ø63; «102-я» = Ø101,6.\n' +
      '- Работа считается не на кг, а ставкой сварщика за метр или м² (изготовление + монтаж): верни laborCost — формулу в тенге от параметров или числом (например "L*4000"), если мастер назвал ставку; иначе пустую строку.\n' +
      '- Если изделие по смыслу совпадает с шаблоном, верни templateId и values (числа в метрах для каждого параметра), parts оставь пустым.\n' +
      '- Иначе templateId = null и перечисли детали: materialId строго из каталога. Для труб, уголка, арматуры укажи n (штук) и len (длина одной детали, м) — по ним строится карта реза. Для листа, профнастила и штучного — qty (м² или шт).\n' +
      '- Размеры, которых не видно, прими типовыми и запиши в assumptions. Не выдумывай материалы вне каталога: если нужного нет, возьми ближайший и укажи это в assumptions.\n' +
      '- Учитывай столбы с заглублением, перемычки, рёбра жёсткости, обшивку.\n\n' +
      'Ответь ТОЛЬКО JSON без пояснений:\n' +
      '{"name": "краткое название изделия", "count": 1, "templateId": "id или null", "values": {"W": 3.5}, "laborCost": "", ' +
      '"parts": [{"materialId": "id", "n": 4, "len": 2.0, "note": "стойки"}, {"materialId": "id", "qty": 7.7, "note": "обшивка"}], "assumptions": ["…"], "questions": ["что уточнить у клиента"]}';

    var opts = { modelTier: 'complex' };
    if (aiFile) opts.images = [aiFile];
    caps.sample.json(prompt, opts).then(function (r) {
      aiBusy = false;
      var it;
      var tpl = r && r.templateId && S.templates.find(function (t) { return t.id === r.templateId; });
      if (tpl) {
        it = itemFromTemplate(tpl, r.values || {});
      } else {
        it = { id: uid('it'), name: r.name || 'Изделие', params: [], values: {}, count: 1, laborHours: '',
          parts: (r.parts || []).filter(function (p) { return p && p.materialId; }).map(function (p) {
            return p.len ? { materialId: String(p.materialId), n: String(p.n || 1), len: String(p.len), note: p.note || '' }
              : { materialId: String(p.materialId), qty: String(p.qty == null ? '' : p.qty), note: p.note || '' };
          }) };
      }
      it.count = Math.max(1, +r.count || 1);
      if (r.laborCost) it.laborCost = String(r.laborCost);
      var notes = [];
      if (r.assumptions && r.assumptions.length) notes.push('Допущения: ' + r.assumptions.join('; '));
      if (r.questions && r.questions.length) notes.push('Уточнить: ' + r.questions.join('; '));
      it.aiNote = notes.join('\n');
      draft.items.push(it); saveDraft();
      aiOpen = false; aiFile = null;
      render();
      toast(tpl ? 'Подобран шаблон «' + tpl.name + '»' : 'Изделие собрано из каталога — проверьте детали');
    }).catch(function (e) {
      aiBusy = false; render();
      var msg = e && e.code === 'not_granted' ? 'Нет разрешения на запрос к Claude.' :
        e && e.code === 'rate_limited' ? 'Слишком много запросов, попробуйте через минуту.' :
        'Не удалось распознать: ' + (e && e.message || 'ошибка');
      var st = $('#ai-status'); if (st) st.textContent = msg;
    });
  }

  /* ---------- Заказы ---------- */
  var ordFilter = '';
  function viewOrders() {
    var now = new Date(), ym = now.toISOString().slice(0, 7);
    var month = S.orders.filter(function (o) { return (o.createdAt || '').slice(0, 7) === ym && o.status !== 'отказ'; });
    var won = month.filter(function (o) { return ['согласован', 'в работе', 'сдан'].indexOf(o.status) >= 0; });
    var sumF = function (arr, f) { return arr.reduce(function (a, o) { return a + (+(o.totals || {})[f] || 0); }, 0); };
    var kg = sumF(won, 'kg'), rev = sumF(won, 'price');
    var list = S.orders.filter(function (o) { return !ordFilter || o.status === ordFilter; });

    return '<section class="stats">' +
      stat('Расчётов в этом месяце', month.length) +
      stat('Принято в работу', won.length + (month.length ? '<small>' + Math.round(won.length / month.length * 100) + '% конверсия</small>' : '')) +
      stat('Металла в работе', C.fmtNum(kg / 1000, 2) + ' т') +
      stat('Выручка', money(rev) + '<small>прибыль ' + money(sumF(won, 'profit')) + '</small>') +
      stat('Средняя цена за кг', kg ? money(rev / kg) : '—') +
      stat('Долги клиентов', money(S.orders.filter(function (o) { return ['в работе', 'сдан'].indexOf(o.status) >= 0; }).reduce(function (a, o) {
        return a + Math.max(0, (+(o.totals || {}).price || 0) - C.factByOrder(S.transactions, o.id).income); }, 0))) +
    '</section>' +
    '<section class="panel">' +
      '<div class="panel-head"><h2>Заказы</h2><div class="row">' +
        '<select id="ord-filter" aria-label="Фильтр по статусу"><option value="">Все статусы</option>' + ['расчёт', 'согласован', 'в работе', 'сдан', 'отказ'].map(function (s) {
          return '<option' + (s === ordFilter ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '</div></div>' +
      (list.length ? '<div class="scroll"><table class="data orders"><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Изделия</th><th class="num">кг</th><th class="num">Цена</th><th class="num">Оплачено</th><th>Статус</th><th></th></tr></thead><tbody>' +
        list.map(function (o) {
          var f = C.factByOrder(S.transactions, o.id), price = +(o.totals || {}).price || 0;
          return '<tr data-action="open-order" data-id="' + esc(o.id) + '" tabindex="0">' +
            '<td>' + esc(o.number) + '</td><td>' + esc((o.createdAt || '').slice(0, 10).split('-').reverse().join('.')) + '</td>' +
            '<td>' + esc(o.client || '—') + (o.phone ? '<small>' + esc(o.phone) + '</small>' : '') + '</td>' +
            '<td class="wrap">' + esc((o.items || []).map(function (it) { return itemTitle(it) + (it.count > 1 ? ' ×' + it.count : ''); }).join(', ')) + '</td>' +
            '<td class="num">' + C.fmtNum((o.totals || {}).kg, 0) + '</td><td class="num">' + n0(price) + '</td>' +
            '<td class="num">' + (f.income ? n0(f.income) + (price - f.income > 0 ? '<small class="debt">долг ' + n0(price - f.income) + '</small>' : '') : '—') + '</td>' +
            '<td><span class="pill s-' + esc(o.status).replace(/\s/g, '') + '">' + esc(o.status) + '</span></td>' +
            '<td class="row-actions"><button class="btn ghost small" data-action="copy-order" data-id="' + esc(o.id) + '">Как новый</button>' +
            confirmBtn('del-order', o.id, 'Удалить') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="empty">Сохранённых заказов пока нет. Посчитайте изделие во вкладке «Расчёт» и нажмите «Сохранить заказ».</div>') +
    '</section>';
  }
  function stat(l, v) { return '<div class="stat"><span>' + l + '</span><b>' + v + '</b></div>'; }

  var armed = null;
  function confirmBtn(action, id, label) {
    var on = armed === action + ':' + id;
    return '<button class="btn ghost small danger' + (on ? ' armed' : '') + '" data-action="' + action + '" data-id="' + esc(id) + '">' + (on ? 'Точно удалить?' : label) + '</button>';
  }

  /* ---------- Шаблоны ---------- */
  function viewTemplates() {
    var cards = S.templates.slice().sort(function (a, b) { return (a.category || '').localeCompare(b.category || '', 'ru') || a.name.localeCompare(b.name, 'ru'); }).map(function (t) {
      var it = itemFromTemplate(t); var r = C.calcItem(it, S.materials);
      return '<article class="tpl" data-action="edit-tpl" data-id="' + esc(t.id) + '" tabindex="0">' +
        '<span class="cat">' + esc(t.category || 'Без категории') + '</span>' +
        '<h3>' + esc(t.name) + '</h3>' +
        '<div class="muted">' + (t.params || []).map(function (p) { return esc(p.label) + ': ' + C.fmtNum(p.def, 2); }).join(' · ') + '</div>' +
        '<div class="tpl-foot"><span>' + (t.parts || []).length + ' дет.</span><b>' + C.fmtNum(r.kg, 1) + ' кг · ' + money(r.metalCost) + '</b></div>' +
      '</article>';
    }).join('');
    return '<section class="panel">' +
      '<div class="panel-head"><h2>Шаблоны изделий</h2><button class="btn primary" data-action="new-tpl">Новый шаблон</button></div>' +
      '<p class="muted">Шаблон хранит конструкцию один раз: детали и формулы длины от размеров. Дальше вводите только размеры, и металл считается сам. Шаблон можно сохранить прямо из расчёта.</p>' +
      '<div class="tpl-grid">' + (cards || '<div class="empty">Шаблонов пока нет.</div>') + '</div>' +
    '</section>';
  }

  function viewTplEdit() {
    var t = editTpl;
    var params = (t.params || []).map(function (p, i) {
      return '<div class="row prow">' +
        '<input id="tp-k-' + i + '" class="key" data-tbind="params.' + i + '.key" value="' + esc(p.key) + '" aria-label="Обозначение" placeholder="W">' +
        '<input id="tp-l-' + i + '" data-tbind="params.' + i + '.label" value="' + esc(p.label) + '" aria-label="Подпись" placeholder="Ширина, м">' +
        '<input id="tp-d-' + i + '" class="num" data-tbind="params.' + i + '.def" data-num value="' + esc(p.def) + '" aria-label="По умолчанию">' +
        '<button class="icon" data-action="tpl-del-param" data-i="' + i + '" aria-label="Удалить параметр">×</button></div>';
    }).join('');
    var parts = (t.parts || []).map(function (p, j) {
      return '<tr><td><select id="tq-m-' + j + '" data-tbind="parts.' + j + '.materialId">' + materialOptions(p.materialId) + '</select></td>' +
        '<td><input id="tq-c-' + j + '" class="formula xs" data-tbind="parts.' + j + '.n" value="' + esc(p.n) + '" placeholder="шт"></td>' +
        '<td><input id="tq-l-' + j + '" class="formula sm" data-tbind="parts.' + j + '.len" value="' + esc(p.len) + '" placeholder="м"></td>' +
        '<td><input id="tq-q-' + j + '" class="formula" data-tbind="parts.' + j + '.qty" value="' + esc(C.hasCut(p) ? '' : p.qty) + '"' + (C.hasCut(p) ? ' disabled' : '') + '></td>' +
        '<td class="num" data-out="tq-' + j + '"></td>' +
        '<td><input id="tq-n-' + j + '" data-tbind="parts.' + j + '.note" value="' + esc(p.note) + '"></td>' +
        '<td><button class="icon" data-action="tpl-del-part" data-i="' + j + '" aria-label="Удалить деталь">×</button></td></tr>';
    }).join('');
    return '<section class="panel">' +
      '<div class="panel-head"><button class="btn ghost" data-action="tpl-back">← Все шаблоны</button>' +
        '<div class="row"><button class="btn" data-action="tpl-use">Посчитать по шаблону</button>' + confirmBtn('tpl-delete', t.id, 'Удалить шаблон') + '</div></div>' +
      '<div class="grid2">' +
        field('Название', '<input id="tp-name" data-tbind="name" value="' + esc(t.name) + '">') +
        field('Категория', '<input id="tp-cat" data-tbind="category" value="' + esc(t.category || '') + '" placeholder="Ворота, навесы, лестницы…">') +
      '</div>' +
      '<h3>Параметры (размеры, которые меняются от заказа к заказу)</h3>' +
      '<div class="params-edit">' + params + '</div>' +
      '<button class="btn ghost" data-action="tpl-add-param">+ параметр</button>' +
      '<h3>Детали</h3>' +
      '<p class="muted">Для трубы и уголка задавайте штуки и длину одной детали: по ним строится карта реза. Пример: 4 шт × <code>H</code> — стойки, <code>ceil(L/0,8)+1</code> шт × <code>B</code> — обрешётка с шагом 0,8 м. Для листа, профнастила и фурнитуры — колонка «всего» (<code>W*H*1,1</code>, <code>4</code>). Функции: <code>ceil</code>, <code>round</code>, <code>max(H;2)</code>.</p>' +
      '<div class="scroll"><table class="parts"><thead><tr><th>Материал</th><th>Шт</th><th>Длина, м</th><th>или всего</th><th class="num">При значениях по умолчанию</th><th>Примечание</th><th></th></tr></thead><tbody>' + parts + '</tbody></table></div>' +
      '<button class="btn ghost" data-action="tpl-add-part">+ деталь</button>' +
      '<div class="field short-field">' + '<label class="lbl" for="tp-w">Работа сварщика, ' + cur() + ' (изготовление + монтаж)</label><input id="tp-w" class="formula" data-tbind="laborCost" value="' + esc(t.laborCost || '') + '" placeholder="L*4000"><small class="muted">Ставка за метр × длина, например <code>L*4000</code>, или за м²: <code>W*H*10000</code></small></div>' +
      '<div class="tpl-total" data-out="tpl-total"></div>' +
    '</section>';
  }

  function refreshTpl() {
    var it = itemFromTemplate(editTpl); var r = C.calcItem(it, S.materials);
    r.lines.forEach(function (l, j) {
      var qel = document.getElementById('tq-q-' + j);
      if (qel && C.hasCut(l.part)) { qel.disabled = true; qel.value = ''; } else if (qel && qel.disabled) { qel.disabled = false; qel.value = l.part.qty || ''; }
      setOut('tq-' + j, l.error ? '<span class="err" title="' + esc(l.error) + '">' + esc(l.error) + '</span>' :
        C.fmtNum(l.qty, 2) + ' ' + esc(l.material ? l.material.unit : '') + ' · ' + C.fmtNum(l.kg, 1) + ' кг');
    });
    setOut('tpl-total', 'Итого при значениях по умолчанию: <b>' + C.fmtNum(r.kg, 1) + ' кг</b>, металл <b>' + money(r.metalCost) + '</b>' + (r.work ? ', работа сварщика <b>' + money(r.work) + '</b>' : '') +
      (r.errors ? ' · <span class="err">ошибок: ' + r.errors + '</span>' : ''));
  }

  function saveTpl() { later('tpl', function () { if (editTpl) Store.put('templates', clone(editTpl)); }, 600); }

  /* ---------- Материалы ---------- */
  function viewMaterials() {
    var q = matQuery.toLowerCase();
    var rows = S.materials.filter(function (m) {
      return (!matSup || (m.supplier || 'Свои') === matSup) && (!q || m.name.toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return (a.kind || '').localeCompare(b.kind || '') || a.name.localeCompare(b.name, 'ru', { numeric: true }); }).map(function (m) {
      var id = esc(m.id), d = m.dims || {};
      var dim = function (k, ph) { return '<input id="m-' + id + '-' + k + '" class="dim" type="number" step="0.1" data-mbind="' + id + '|dims.' + k + '" data-num value="' + esc(d[k] == null ? '' : d[k]) + '" placeholder="' + ph + '" aria-label="' + ph + '">'; };
      var dims = { rect: dim('a', 'A') + dim('b', 'B') + dim('t', 't'), square: dim('a', 'A') + dim('t', 't'), round: dim('d', 'D') + dim('t', 't'),
        angle: dim('a', 'A') + dim('b', 'B') + dim('t', 't'), strip: dim('a', 'ширина') + dim('t', 't'), rod: dim('d', 'Ø'), sheet: dim('t', 't'), profile: '<span class="muted">по ГОСТ 8240</span>' }[m.kind];
      return '<tr>' +
        '<td><input id="m-' + id + '-name" data-mbind="' + id + '|name" value="' + esc(m.name) + '"></td>' +
        '<td><select id="m-' + id + '-kind" data-mbind="' + id + '|kind" data-struct>' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (k === m.kind ? ' selected' : '') + '>' + KINDS[k] + '</option>'; }).join('') + '</select></td>' +
        '<td class="dims">' + (dims || '<input id="m-' + id + '-unit" class="dim" data-mbind="' + id + '|unit" value="' + esc(m.unit) + '" aria-label="Единица">') + '</td>' +
        '<td class="num">' + (m.kind === 'custom' || m.kind === 'profile' ? '<input id="m-' + id + '-kg" class="dim" type="number" step="0.01" data-mbind="' + id + '|kgPerUnit" data-num value="' + esc(m.kgPerUnit) + '" aria-label="кг на единицу">' : '<span data-out="mkg-' + id + '">' + C.fmtNum(C.materialKg(m), 2) + '</span>') + '<small>кг/' + esc(m.unit) + '</small></td>' +
        '<td class="price-cell"><input id="m-' + id + '-price" class="num" type="number" data-mbind="' + id + '|price" data-num value="' + esc(m.price) + '" aria-label="Цена">' +
          '<select id="m-' + id + '-pm" data-mbind="' + id + '|priceMode" aria-label="За что цена"><option value="kg"' + (m.priceMode === 'kg' ? ' selected' : '') + '>за кг</option><option value="unit"' + (m.priceMode !== 'kg' ? ' selected' : '') + '>за ' + esc(m.unit) + '</option></select></td>' +
        '<td class="num" data-out="mp-' + id + '">' + money(C.unitPrice(m)) + '</td>' +
        '<td>' + (m.kind === 'sheet' || m.kind === 'custom' ? '' : '<input id="m-' + id + '-stock" class="dim" type="number" step="0.5" data-mbind="' + id + '|stockLen" data-num value="' + esc(m.stockLen || '') + '" placeholder="' + esc(S.settings.stockLen || 6) + '" aria-label="Длина хлыста, м">') + '</td>' +
        '<td class="sup">' + esc(m.supplier || '') + (m.priceDate ? '<small>' + esc(dateRu(m.priceDate)) + '</small>' : '') + '</td>' +
        '<td>' + confirmBtn('del-mat', m.id, '×') + '</td>' +
      '</tr>';
    }).join('');
    return '<section class="panel">' +
      '<div class="panel-head"><h2>Каталог металла</h2><div class="row">' +
        '<button class="btn primary" data-action="add-mat">Добавить материал</button></div></div>' +
      '<p class="muted">Вес трубы, уголка, листа и круга считается по размерам в миллиметрах (по ГОСТ, с учётом скруглений). Для швеллера, петель, замков и профнастила вес задаётся вручную. Цена листа — за м².</p>' +
      priceSources() +
      '<div class="bulk row"><label class="lbl" for="bulk-pct">Цены у поставщика изменились?</label>' +
        '<input id="bulk-pct" class="num short" type="number" step="0.5" placeholder="+5"> <span>% к ценам</span>' +
        '<select id="bulk-sup" class="short-sel" aria-label="Чьим ценам">' + suppliers().map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('') + '<option value="">заданным за кг</option></select>' +
        '<button class="btn" data-action="bulk-price">Применить</button></div>' +
      '<div class="row mat-filter"><input id="mat-q" type="search" placeholder="Поиск: 40×40, AISI304, швеллер…" value="' + esc(matQuery) + '" aria-label="Поиск по каталогу">' +
        '<select id="mat-sup" aria-label="Поставщик"><option value="">Все поставщики</option>' + suppliers().concat(['Свои']).map(function (x) {
          return '<option' + (x === matSup ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' +
        '</div>' +
      '<div class="scroll"><table class="data mats"><thead><tr><th>Название</th><th>Тип</th><th>Размеры, мм</th><th class="num">Вес</th><th>Цена</th><th class="num">За единицу</th><th>Хлыст, м</th><th>Прайс</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</section>';
  }

  var matQuery = '', matSup = '';
  function suppliers() {
    var x = {}; S.materials.forEach(function (m) { if (m.supplier) x[m.supplier] = 1; }); return Object.keys(x).sort();
  }
  function priceSources() {
    var src = {};
    S.materials.forEach(function (m) { if (m.supplier) { var k = m.supplier + '|' + (m.priceDate || ''); src[k] = (src[k] || 0) + 1; } });
    var keys = Object.keys(src);
    if (!keys.length) return '';
    return '<div class="src">' + keys.map(function (k) {
      var p = k.split('|'), days = p[1] ? Math.floor((Date.now() - new Date(p[1])) / 864e5) : null;
      return '<span>Прайс <b>' + esc(p[0]) + '</b>' + (p[1] ? ' от ' + dateRu(p[1]) : '') + ': ' + src[k] + ' поз.' +
        (days > 30 ? ' · <span class="old">цены старше месяца, обновите прайс</span>' : '') + '</span>';
    }).join('') + '</div>';
  }

  /* ---------- Настройки ---------- */
  function viewSettings() {
    var s = S.settings;
    var num = function (key, label, hint) {
      return field(label, '<input id="s-' + key + '" type="number" step="any" data-sbind="' + key + '" data-num value="' + esc(s[key]) + '">' + (hint ? '<small class="muted">' + hint + '</small>' : ''));
    };
    var fixed = (s.fixedCosts || []).map(function (f, i) {
      return '<div class="row"><input id="fc-n-' + i + '" data-sbind="fixedCosts.' + i + '.name" value="' + esc(f.name) + '" aria-label="Статья">' +
        '<input id="fc-a-' + i + '" class="num" type="number" data-sbind="fixedCosts.' + i + '.amount" data-num value="' + esc(f.amount) + '" aria-label="Сумма в месяц">' +
        '<button class="icon" data-action="del-fixed" data-i="' + i + '" aria-label="Удалить">×</button></div>';
    }).join('');
    var total = (s.fixedCosts || []).reduce(function (a, f) { return a + (+f.amount || 0); }, 0);
    return '<div class="settings">' +
      '<section class="panel"><h2>Коэффициенты</h2>' +
        '<p class="muted">Всё, что меняется от веса изделия, задаётся на 1 кг металла. Так один раз настроили — и любое изделие считается одинаково.</p>' +
        '<div class="grid3">' +
          num('wastePct', 'Отходы и обрезки, %', 'надбавка к металлу') +
          num('consumablesPerKg', 'Расходники на 1 кг', 'электроды, диски, газ, проволока') +
          num('paintPerKg', 'Грунт и краска на 1 кг', 'если в заказе отмечена покраска') +
          num('laborPerKg', 'Работа на 1 кг (обычно 0)', 'работа задаётся в изделии: ставка за метр или м²') +
          num('hourRate', 'Ставка часа', 'для доп. часов в изделии') +
          num('installPerKg', 'Монтаж на 1 кг (обычно 0)', 'монтаж входит в ставку сварщика в изделии') +
          num('stockLen', 'Длина хлыста по умолчанию, м', 'можно задать свою у каждого профиля') +
          num('kerfMm', 'Ширина реза, мм', 'диск 1,6–3 мм') +
        '</div>' +
        check('s-wholeBars', 'wholeBars', s.wholeBars, 'Металл считать по целым хлыстам (как продаёт поставщик): отход — это остаток хлыста по карте реза').replace('data-bind=', 'data-sbind=') +
        '<p class="muted">Загружайте чеки во вкладке «Деньги»: там же кнопка, которая пересчитает эти коэффициенты по фактическим расходам.</p></section>' +
      '<section class="panel"><h2>Транспорт</h2><div class="grid3">' +
          num('fuelPrice', 'Цена бензина за литр') +
          num('fuelPer100', 'Расход, л на 100 км', 'газель с грузом ≈ 14–16') +
          num('tripFixed', 'Фикс за выезд', 'время водителя, износ машины') +
        '</div></section>' +
      '<section class="panel"><h2>Постоянные расходы в месяц</h2>' +
        '<p class="muted">Аренда, свет, зарплата офиса — делятся на объём металла за месяц и попадают в каждое изделие пропорционально весу.</p>' +
        '<div class="fixed">' + fixed + '</div>' +
        '<button class="btn ghost" data-action="add-fixed">+ статья расходов</button>' +
        '<div class="grid3">' + num('monthlyKg', 'Перерабатываете металла в месяц, кг', 'посмотрите итог во вкладке «Заказы»') +
          '<div class="field"><span class="lbl">Получается</span><div class="big-out" data-out="ohk">' + money(total) + ' в месяц → <b>' + money(C.overheadPerKg(s)) + ' на 1 кг</b></div></div></div>' +
      '</section>' +
      '<section class="panel"><h2>Цена и коммерческое предложение</h2><div class="grid3">' +
          num('marginPct', 'Наценка по умолчанию, %') +
          num('roundTo', 'Округлять цену вверх до', '500 или 1000') +
          field('Валюта', '<input id="s-currency" data-sbind="currency" value="' + esc(s.currency) + '">') +
          field('Название цеха для КП', '<input id="s-company" data-sbind="company" value="' + esc(s.company) + '">') +
          field('Телефон для КП', '<input id="s-phone" data-sbind="phone" value="' + esc(s.phone) + '">') +
          num('leadDays', 'Срок изготовления, рабочих дней') +
          num('validDays', 'КП действительно, дней') +
          field('Адрес цеха', '<input id="s-address" data-sbind="address" value="' + esc(s.address) + '">') +
          field('БИН / ИИН', '<input id="s-bin" data-sbind="bin" value="' + esc(s.bin) + '">') +
          field('Условия оплаты', '<input id="s-pay" data-sbind="payTerms" value="' + esc(s.payTerms) + '">') +
          field('Гарантия', '<input id="s-warr" data-sbind="warranty" value="' + esc(s.warranty) + '">') +
        '</div>' +
        '<div class="row logo-row">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="Логотип" class="logo-prev">' : '') +
          '<label class="btn" for="logo-file">' + (s.logo ? 'Заменить логотип' : 'Загрузить логотип для КП') + '<input id="logo-file" type="file" accept="image/*" hidden></label>' +
          (s.logo ? '<button class="btn ghost danger" data-action="logo-del">Убрать</button>' : '') + '</div>' +
      '</section>' +
      '<section class="panel"><h2>Резервная копия</h2>' +
        '<p class="muted">' + (storeMode === 'db' ? 'Данные хранятся в облаке и доступны с любого вашего устройства. Копия пригодится для переноса.' : 'Сейчас данные живут только в этом браузере. Сохраняйте копию раз в неделю.') + '</p>' +
        '<div class="row">' + (caps.downloads ? '<button class="btn" data-action="backup">Скачать копию (JSON)</button>' : '<button class="btn" data-action="backup-copy">Скопировать копию (JSON)</button>') +
        '<label class="btn" for="restore-file">Восстановить из файла<input id="restore-file" type="file" accept="application/json,.json" hidden></label></div>' +
      '</section>' +
    '</div>';
  }

  /* ================= Карта реза ================= */
  function refreshCut(plans) {
    var el = $('#cutmap'); if (!el) return;
    if (!plans.length) { el.innerHTML = '<div class="muted">Задайте у труб и уголков штуки и длину детали, и здесь появится раскладка по хлыстам.</div>'; return; }
    el.innerHTML = plans.map(function (p) {
      var stockMm = Math.round(p.stock * 1000);
      return '<div class="cut-mat">' +
        '<div class="cut-head"><b>' + esc(p.material.name) + '</b><span>' + p.bars.length + ' хлыст. по ' + C.fmtNum(p.stock, 2) + ' м · отход ' + C.fmtNum(p.wastePct, 0) + '%' +
          (p.joints ? ' · стыков: ' + p.joints : '') + '</span></div>' +
        (p.uncut ? '<div class="cut-warn">' + C.fmtNum(p.uncut, 2) + ' м без нарезки: задайте шт × длину, чтобы раскладка была точной</div>' : '') +
        p.bars.map(function (b, k) {
          return '<div class="bar-row"><span class="bar-n">' + (k + 1) + '</span><div class="bar" role="img" aria-label="Хлыст ' + (k + 1) + ': ' + b.cuts.map(function (c) { return Math.round(c.len * 1000); }).join(' + ') + ' мм">' +
            b.cuts.map(function (c) {
              var w = c.len / p.stock * 100;
              return '<span class="seg" style="flex-basis:' + w.toFixed(2) + '%" title="' + esc(c.label) + '">' + (w > 9 ? Math.round(c.len * 1000) : '') + '</span>';
            }).join('') +
            (b.rest > 0.001 ? '<span class="rest" style="flex-basis:' + (b.rest / p.stock * 100).toFixed(2) + '%" title="Остаток">' + (b.rest / p.stock > 0.09 ? Math.round(b.rest * 1000) : '') + '</span>' : '') +
          '</div></div>';
        }).join('') +
        '<div class="cut-scale"><span>0</span><span>' + stockMm + ' мм</span></div>' +
      '</div>';
    }).join('');
  }

  function cutText() {
    var plans = C.orderCutPlans(draft, S.materials, S.settings);
    var out = ['КАРТА РЕЗА' + (draft.number ? ' · заказ № ' + draft.number : '') + (draft.client ? ' · ' + draft.client : ''), 'Рез ' + S.settings.kerfMm + ' мм, размеры в мм', ''];
    plans.forEach(function (p) {
      out.push(p.material.name + ' — ' + p.bars.length + ' хлыст. по ' + C.fmtNum(p.stock, 2) + ' м');
      p.bars.forEach(function (b, k) {
        out.push('  ' + (k + 1) + ') ' + b.cuts.map(function (c) { return Math.round(c.len * 1000) + ' (' + c.label + ')'; }).join(' + ') + '  | остаток ' + Math.round(b.rest * 1000));
      });
      out.push('');
    });
    return out.join('\n');
  }

  /* ================= План против факта ================= */
  function planFactPanel() {
    var cats = C.CATEGORIES.filter(function (c) { return c.type !== 'skip'; }).map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.label) + '</option>'; }).join('');
    return '<section class="panel"><div class="panel-head"><h3>План против факта</h3><span class="muted">по операциям, привязанным к заказу</span></div>' +
      '<div id="planfact"></div>' +
      '<div class="pf-add row">' +
        '<select id="pf-cat" aria-label="Статья">' + cats + '</select>' +
        '<input id="pf-amount" class="num" type="number" placeholder="Сумма" aria-label="Сумма">' +
        '<input id="pf-desc" placeholder="Что это (необязательно)" aria-label="Описание">' +
        '<button class="btn" data-action="pf-add">Записать</button>' +
      '</div>' +
      '<p class="muted">Чеки и выписку удобнее загрузить во вкладке «Деньги»: там операции можно сразу привязать к заказу.</p>' +
    '</section>';
  }

  function refreshPlanFact(R) {
    var el = $('#planfact'); if (!el) return;
    var pf = C.planVsFact(R, S.transactions, draft.id);
    // Пока заказ не сдан, факт неполный: итоговую разницу и прибыль не показываем
    var done = draft.status === 'сдан';
    var diff = function (plan, fact) {
      var d = fact - plan; if (!fact) return '<td class="num muted">—</td>';
      return '<td class="num ' + (d > plan * 0.05 ? 'over' : d < 0 ? 'under' : '') + '">' + (d > 0 ? '+' : '') + n0(d) + '</td>';
    };
    el.innerHTML = '<div class="pf-tiles">' +
      kpi('Оплачено клиентом', money(pf.paid)) +
      kpi('Долг клиента', money(Math.max(0, pf.debt)), pf.debt > 0 ? 'warnk' : '') +
      kpi('Прибыль по плану', money(pf.planProfit)) +
      (done ? kpi('Прибыль по факту', money(pf.factProfit), pf.factProfit < pf.planProfit ? 'bad' : 'good')
        : kpi('Внесено расходов', money(pf.factDirect) + ' из ' + n0(pf.planDirect))) +
    '</div>' +
    '<div class="scroll"><table class="data"><thead><tr><th>Статья</th><th class="num">План</th><th class="num">Факт</th><th class="num">Разница</th></tr></thead><tbody>' +
      pf.rows.map(function (r) { return '<tr><td>' + esc(r.label) + '</td><td class="num">' + n0(r.plan) + '</td><td class="num">' + (r.fact ? n0(r.fact) : '—') + '</td>' + diff(r.plan, r.fact) + '</tr>'; }).join('') +
      '<tr class="tot"><td>Прямые затраты</td><td class="num">' + n0(pf.planDirect) + '</td><td class="num">' + n0(pf.factDirect) + '</td>' + (done ? diff(pf.planDirect, pf.factDirect) : '<td class="num muted">после сдачи</td>') + '</tr>' +
    '</tbody></table></div>' +
    '<p class="muted small">Постоянные расходы (аренда и т.п.) в план не входят: они считаются за месяц, а не по заказу. Прибыль по факту появится, когда заказ получит статус «сдан».</p>';
  }

  /* ================= Коммерческое предложение ================= */
  var kpOpen = false;
  function kpPanel() {
    if (!kpOpen) return '';
    var k = draft.kp || {}, s = S.settings;
    return '<section class="panel kp-panel">' +
      '<div class="panel-head"><h3>Коммерческое предложение</h3><button class="icon" data-action="kp-close" aria-label="Закрыть">×</button></div>' +
      '<div class="grid3">' +
        field('Условия оплаты', '<input id="kp-pay" data-bind="kp.payTerms" value="' + esc(k.payTerms != null ? k.payTerms : s.payTerms) + '">') +
        field('Срок изготовления, раб. дней', '<input id="kp-lead" data-bind="kp.leadDays" value="' + esc(k.leadDays != null ? k.leadDays : s.leadDays) + '">') +
        field('Действительно, дней', '<input id="kp-valid" data-bind="kp.validDays" value="' + esc(k.validDays != null ? k.validDays : s.validDays) + '">') +
      '</div>' +
      field('Дополнительно для клиента', '<textarea id="kp-note" rows="2" data-bind="kp.note" placeholder="Например: цвет покраски по RAL на выбор, вывоз мусора включён">' + esc(k.note || '') + '</textarea>') +
      check('kp-unit', 'kp.hideItemPrices', k.hideItemPrices, 'Не показывать цену по позициям, только итог') +
      '<div class="kp-wrap"><div id="kp-preview"></div></div>' +
      '<div class="row"><button class="btn primary" data-action="kp-pdf">Скачать PDF</button>' +
        '<button class="btn" data-action="copy-kp">Скопировать текстом</button>' +
        (s.company === 'Мой цех' || !s.phone ? '<span class="muted">Название цеха, телефон и логотип задаются во вкладке «Коэффициенты».</span>' : '') + '</div>' +
    '</section>';
  }

  function kpVal(key) { var k = draft.kp || {}; return k[key] != null && k[key] !== '' ? k[key] : S.settings[key]; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + (+n || 0)); return x; }
  function dateRu(d) { return new Date(d).toLocaleDateString('ru-RU'); }

  function kpDoc(R) {
    var s = S.settings, o = draft.options, prices = C.allocatePrice(R, draft, s), hide = (draft.kp || {}).hideItemPrices;
    var date = draft.createdAt || new Date().toISOString();
    var incl = ['металл', 'изготовление'];
    if (o.paint) incl.push('грунт и покраска');
    if (+o.trips) incl.push('доставка');
    if (o.install) incl.push('монтаж на объекте');
    var rows = draft.items.map(function (it, i) {
      var vars = C.paramVars(it.params, it.values);
      var dims = (it.params || []).map(function (p) { return esc((p.label || p.key).replace(/,.*$/, '')) + ' ' + C.fmtNum(vars[p.key], 2) + ' м'; }).join(', ');
      var cnt = +it.count || 1;
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(it.name) + '</b>' + (dims ? '<div class="kp-dim">' + dims + '</div>' : '') + '</td><td class="r">' + cnt + ' шт</td>' +
        (hide ? '' : '<td class="r">' + n0(prices[i] / cnt) + '</td><td class="r">' + n0(prices[i]) + '</td>') + '</tr>';
    }).join('');
    return '<div class="kp-doc" id="kp-doc">' +
      '<header class="kp-head">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="">' : '') +
        '<div><div class="kp-co">' + esc(s.company) + '</div><div class="kp-req">' + [s.address, s.phone, s.bin ? 'БИН ' + s.bin : ''].filter(Boolean).map(esc).join(' · ') + '</div></div></header>' +
      '<h1>Коммерческое предложение</h1>' +
      '<div class="kp-meta">' + (draft.number ? '№ ' + esc(draft.number) + ' ' : '') + 'от ' + dateRu(date) +
        (draft.client ? '<br>Для: <b>' + esc(draft.client) + '</b>' : '') + (draft.address ? '<br>Объект: ' + esc(draft.address) : '') + '</div>' +
      '<table class="kp-table"><thead><tr><th>№</th><th>Наименование</th><th class="r">Кол-во</th>' + (hide ? '' : '<th class="r">Цена</th><th class="r">Сумма</th>') + '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="kp-total"><span>Итого</span><b>' + money(R.price) + '</b></div>' +
      '<div class="kp-incl">В стоимость входит: ' + incl.join(', ') + '.</div>' +
      '<dl class="kp-terms">' +
        (kpVal('leadDays') ? '<dt>Срок изготовления</dt><dd>' + esc(kpVal('leadDays')) + ' рабочих дней с момента предоплаты</dd>' : '') +
        (kpVal('payTerms') ? '<dt>Оплата</dt><dd>' + esc(kpVal('payTerms')) + '</dd>' : '') +
        (s.warranty ? '<dt>Гарантия</dt><dd>' + esc(s.warranty) + '</dd>' : '') +
        (kpVal('validDays') ? '<dt>Предложение действительно</dt><dd>до ' + dateRu(addDays(new Date(), kpVal('validDays'))) + '</dd>' : '') +
      '</dl>' +
      ((draft.kp || {}).note ? '<p class="kp-note">' + esc(draft.kp.note) + '</p>' : '') +
      '<footer class="kp-foot"><span>' + esc(s.company) + (s.phone ? ', ' + esc(s.phone) : '') + '</span><span>Подпись ____________</span></footer>' +
    '</div>';
  }

  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
  var scriptCache = {};
  function loadScript(src) {
    return scriptCache[src] = scriptCache[src] || new Promise(function (ok, fail) {
      var el = document.createElement('script'); el.src = src; el.onload = ok;
      el.onerror = function () { delete scriptCache[src]; fail(new Error('не загрузилась библиотека')); };
      document.head.appendChild(el);
    });
  }

  function kpPdf(btn) {
    var doc = $('#kp-doc'); if (!doc) return;
    btn.disabled = true; btn.textContent = 'Готовлю PDF…';
    var done = function () { btn.disabled = false; btn.textContent = 'Скачать PDF'; };
    Promise.all([loadScript(CDN + 'html2canvas/1.4.1/html2canvas.min.js'), loadScript(CDN + 'jspdf/2.5.1/jspdf.umd.min.js')])
      .then(function () { return document.fonts ? document.fonts.ready : null; })
      .then(function () {
        doc.classList.add('kp-capture');
        return window.html2canvas(doc, { scale: 2, backgroundColor: '#ffffff', windowWidth: 1200 });
      }).then(function (canvas) {
        doc.classList.remove('kp-capture');
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
        var pw = 210, pxPerMm = canvas.width / pw, pageH = Math.floor(297 * pxPerMm);
        for (var y = 0, page = 0; y < canvas.height; y += pageH, page++) {
          var h = Math.min(pageH, canvas.height - y), slice = document.createElement('canvas');
          slice.width = canvas.width; slice.height = h;
          slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          if (page) pdf.addPage();
          pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, h / pxPerMm);
        }
        var name = 'KP-' + (draft.number || 'raschet') + (draft.client ? '-' + draft.client.replace(/[^\wА-Яа-яЁё]+/g, '_') : '') + '.pdf';
        if (caps.downloads) return caps.downloads.save({ filename: name, data: pdf.output('blob') }).then(function () { toast('PDF сохранён'); });
        pdf.save(name);
      }).catch(function (e) {
        doc.classList.remove('kp-capture');
        if (e && e.code) toast('Скачивание отменено', true); else toast('PDF не получился: ' + (e && e.message || 'ошибка'), true);
      }).then(done);
  }

  function setLogo(file) {
    if (!file) return;
    shrinkImage(file, 360, 'image/png').then(function (blob) {
      var r = new FileReader();
      r.onload = function () { S.settings.logo = r.result; Store.saveSettings(); render(); };
      r.readAsDataURL(blob);
    }).catch(function () { toast('Не удалось прочитать картинку', true); });
  }

  function shrinkImage(file, max, type) {
    return createImageBitmap(file).then(function (bmp) {
      var k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (ok, fail) { c.toBlob(function (b) { b ? ok(b) : fail(new Error('canvas')); }, type || 'image/jpeg', 0.85); });
    });
  }

  /* ================= Деньги: чеки, выписки Kaspi, учёт ================= */
  var staged = [], finMonth = new Date().toISOString().slice(0, 7), finCat = '', coefMonths = 3, finFiles = [], finBusy = false;
  function today() { return new Date().toISOString().slice(0, 10); }
  function sortTx() { S.transactions.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''); }); }
  function catOptions(sel) {
    return C.CATEGORIES.map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('');
  }
  function orderOptions(sel) {
    return '<option value="">— без заказа —</option>' + S.orders.filter(function (o) { return o.status !== 'отказ' || o.id === sel; }).map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === sel ? ' selected' : '') + '>№' + esc(o.number) + ' · ' + esc(o.client || 'без имени') + '</option>';
    }).join('');
  }

  function viewMoney() {
    var month = S.transactions.filter(function (t) { return (t.date || '').slice(0, 7) === finMonth; });
    var inc = 0, exp = 0, byCat = {};
    month.forEach(function (t) {
      var c = C.CAT[t.category] || C.CAT.other, a = Math.abs(+t.amount || 0);
      if (c.type === 'income') inc += a;
      else if (c.type === 'expense') { exp += a; byCat[c.id] = (byCat[c.id] || 0) + a; }
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    var maxC = cats.length ? byCat[cats[0]] : 1;
    var list = month.filter(function (t) { return !finCat || t.category === finCat; });

    var upload = '<section class="panel">' +
      '<h2>Загрузить чеки и выписку</h2>' +
      '<p class="muted">Фото чеков, скриншоты или PDF-выписка Kaspi за месяц. Claude разнесёт операции по статьям и привяжет оплаты к заказам по имени клиента. Перед сохранением всё можно поправить.</p>' +
      (caps.sample ? '<label class="drop" for="fin-files"><input type="file" id="fin-files" multiple accept="image/*,application/pdf,.pdf"><span data-out="fin-files-name">' +
          (finFiles.length ? finFiles.map(function (f) { return esc(f.name); }).join(', ') : 'Выбрать фото чеков или выписку (PDF)') + '</span></label>' +
        field('Или вставьте текст: SMS, выгрузку, список трат', '<textarea id="fin-text" rows="2" placeholder="21.10 АЗС Helios 18 500; 22.10 электроды МР-3 4 пачки 24 000"></textarea>') +
        '<div class="row"><button class="btn primary" data-action="fin-run"' + (finBusy ? ' disabled' : '') + '>' + (finBusy ? 'Распознаю…' : 'Распознать') + '</button>' +
        '<button class="btn ghost" data-action="stage-add">+ операция вручную</button><span id="fin-status" class="muted"></span></div>'
      : '<p class="muted">Распознавание работает в облачной версии на claude.ai. Здесь можно добавить операции вручную.</p><button class="btn" data-action="stage-add">+ операция вручную</button>') +
    '</section>';

    var stage = staged.length ? '<section class="panel stage">' +
      '<div class="panel-head"><h2>Проверьте перед сохранением</h2><div class="row">' +
        '<button class="btn primary" data-action="stage-save">Сохранить отмеченные (<span data-out="stage-count">' + staged.filter(function (x) { return x.include; }).length + '</span>)</button>' +
        '<button class="btn ghost" data-action="stage-clear">Отменить</button></div></div>' +
      '<div class="scroll"><table class="data tx"><thead><tr><th></th><th>Дата</th><th>Описание</th><th>Статья</th><th>Заказ</th><th title="Есть чек, накладная или ЭСФ — расход уменьшает налог">Док.</th><th class="num">Сумма</th></tr></thead><tbody>' +
      staged.map(function (x, i) {
        return '<tr class="' + (x.dup ? 'dup' : '') + '">' +
          '<td><input type="checkbox" id="st-i-' + i + '" data-xbind="' + i + '|include"' + (x.include ? ' checked' : '') + ' aria-label="Сохранить"></td>' +
          '<td><input type="date" id="st-d-' + i + '" data-xbind="' + i + '|date" value="' + esc(x.date) + '"></td>' +
          '<td><input id="st-s-' + i + '" data-xbind="' + i + '|description" value="' + esc(x.description) + '">' +
            '<small>' + esc([x.counterparty, x.source].filter(Boolean).join(' · ')) + (x.dup ? ' · <b>похоже, уже есть в учёте</b>' : '') + '</small></td>' +
          '<td><select id="st-c-' + i + '" data-xbind="' + i + '|category">' + catOptions(x.category) + '</select></td>' +
          '<td><select id="st-o-' + i + '" data-xbind="' + i + '|orderId">' + orderOptions(x.orderId) + '</select></td>' +
          '<td>' + (x.direction === 'expense' ? '<input type="checkbox" id="st-doc-' + i + '" data-xbind="' + i + '|doc"' + (x.doc ? ' checked' : '') + ' aria-label="Есть документ">' : '') + '</td>' +
          '<td><input id="st-a-' + i + '" class="num ' + (x.direction === 'income' ? 'inc' : '') + '" type="number" data-xbind="' + i + '|amount" data-num value="' + esc(x.amount) + '"></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div></section>' : '';

    var summary = '<section class="stats">' +
      stat('Поступления', money(inc)) + stat('Расходы', money(exp)) +
      stat('Разница', '<span class="' + (inc - exp < 0 ? 'neg' : '') + '">' + money(inc - exp) + '</span>') +
      stat('Операций', month.length) +
    '</section>';

    var bars = cats.length ? '<section class="panel"><h3>Куда ушли деньги</h3><div class="cat-bars">' + cats.map(function (id) {
      return '<button class="cat-bar' + (finCat === id ? ' on' : '') + '" data-action="fin-filter" data-id="' + id + '"><span class="cb-l">' + esc(C.CAT[id].label) + '</span>' +
        '<span class="cb-t"><span style="width:' + (byCat[id] / maxC * 100).toFixed(1) + '%"></span></span><b>' + n0(byCat[id]) + '</b></button>';
    }).join('') + '</div></section>' : '';

    var table = '<section class="panel"><div class="panel-head"><h2>Операции</h2><div class="row">' +
        '<input type="month" id="fin-month" value="' + esc(finMonth) + '" aria-label="Месяц">' +
        '<select id="fin-cat" aria-label="Статья"><option value="">Все статьи</option>' + catOptions(finCat) + '</select>' +
        '<button class="btn" data-action="acc-report">Отчёт для бухгалтера (Excel)</button></div></div>' +
      (list.length ? '<div class="scroll"><table class="data tx"><thead><tr><th>Дата</th><th>Описание</th><th>Статья</th><th>Заказ</th><th title="Есть чек, накладная или ЭСФ — расход уменьшает налог">Док.</th><th class="num">Сумма</th><th></th></tr></thead><tbody>' +
        list.map(function (t) {
          var id = esc(t.id), inc = (C.CAT[t.category] || {}).type === 'income';
          return '<tr><td class="nowrap">' + esc((t.date || '').split('-').reverse().join('.')) + '</td>' +
            '<td><input id="tx-s-' + id + '" data-tx="' + id + '|description" value="' + esc(t.description) + '" aria-label="Описание"><small>' + esc(t.counterparty || '') + '</small></td>' +
            '<td><select id="tx-c-' + id + '" data-tx="' + id + '|category" aria-label="Статья">' + catOptions(t.category) + '</select></td>' +
            '<td><select id="tx-o-' + id + '" data-tx="' + id + '|orderId" aria-label="Заказ">' + orderOptions(t.orderId) + '</select></td>' +
            '<td>' + (inc || t.category === 'personal' ? '' : '<input type="checkbox" id="tx-doc-' + id + '" data-tx="' + id + '|doc"' + (t.doc ? ' checked' : '') + ' aria-label="Есть документ">') + '</td>' +
            '<td class="num ' + (inc ? 'inc' : '') + '">' + (inc ? '+' : '−') + n0(t.amount) + '</td>' +
            '<td>' + confirmBtn('del-tx', t.id, '×') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="empty">За этот месяц операций нет. Загрузите чеки или выписку выше.</div>') +
    '</section>';

    var sug = C.suggestCoefficients(S.transactions, S.orders, S.settings, coefMonths);
    var coef = '<section class="panel"><div class="panel-head"><h2>Коэффициенты по факту</h2>' +
        '<select id="coef-months" aria-label="Период">' + [1, 3, 6, 12].map(function (m) { return '<option value="' + m + '"' + (m === coefMonths ? ' selected' : '') + '>за ' + m + ' мес.</option>'; }).join('') + '</select></div>' +
      '<p class="muted">Сравнение ваших настроек с реальными расходами с ' + dateRu(sug.from) + '. Объём металла берётся из заказов в работе и сданных: ' + C.fmtNum(sug.kg, 0) + ' кг.</p>' +
      (sug.rows.length ? '<div class="scroll"><table class="data"><thead><tr><th>Коэффициент</th><th class="num">Сейчас</th><th class="num">По факту</th><th></th></tr></thead><tbody>' +
        sug.rows.map(function (r) {
          var big = r.current && Math.abs(r.fact - r.current) / r.current > 0.15;
          return '<tr><td>' + esc(r.label) + '</td><td class="num">' + n0(r.current) + '</td><td class="num' + (big ? ' over' : '') + '">' + n0(r.fact) + '</td>' +
            '<td><button class="btn small" data-action="coef-apply" data-key="' + r.key + '" data-val="' + r.fact + '">Применить</button></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="muted">' + (sug.kg ? 'Пока нет расходов по статьям, которые считаются на кг.' : 'Нужны заказы со статусом «в работе» или «сдан» за этот период, чтобы посчитать расход на 1 кг.') + '</div>') +
      (sug.fixedCosts.length ? '<h3>Постоянные расходы, в среднем за месяц</h3><div class="fixed-sug">' +
        sug.fixedCosts.map(function (f) { return '<div class="srow"><span>' + esc(f.name) + '</span><b>' + n0(f.amount) + '</b></div>'; }).join('') +
        '</div><button class="btn" data-action="coef-fixed">Заменить постоянные расходы в настройках на эти</button>' : '') +
    '</section>';

    return '<div class="money">' + upload + stage + taxPanel() + summary + bars + table + coef + '</div>';
  }

  function taxPanel() {
    var s = S.settings, rows = C.taxByMonth(S.transactions, s);
    var year = new Date().getFullYear(), yi = C.yearIncome(S.transactions, year), thr = +s.ndsThreshold || 0;
    var first = S.transactions.filter(function (t) { return (t.date || '').slice(0, 4) === String(year); }).map(function (t) { return t.date; }).sort()[0];
    var adj = (s.taxAdjustments || []).map(function (x, i) {
      return '<div class="row adj">' +
        '<input type="month" id="adj-m-' + i + '" data-sbind="taxAdjustments.' + i + '.month" value="' + esc(x.month) + '" aria-label="Месяц">' +
        '<input id="adj-a-' + i + '" class="num" type="number" data-sbind="taxAdjustments.' + i + '.amount" data-num value="' + esc(x.amount) + '" aria-label="Сумма">' +
        '<input id="adj-n-' + i + '" data-sbind="taxAdjustments.' + i + '.note" value="' + esc(x.note) + '" placeholder="Например: начислено по уведомлению" aria-label="Пояснение">' +
        '<button class="icon" data-action="adj-del" data-i="' + i + '" aria-label="Удалить">×</button></div>';
    }).join('');
    return '<section class="panel tax">' +
      '<div class="panel-head"><h2>Налог</h2><span class="muted">' + esc(s.taxRegime) + '</span></div>' +
      (rows.length ? '<div class="scroll"><table class="data"><thead><tr><th>Месяц</th><th class="num">Доход</th><th class="num">Вычеты по документам</th><th class="num">База</th><th class="num">ИПН ' + C.fmtNum(s.taxRate, 1) + '%</th><th class="num">Доначисления</th><th class="num">К уплате</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td class="nowrap">' + monthRu(r.month) + '</td><td class="num">' + n0(r.income) + '</td><td class="num">' + n0(r.deductions) + '</td><td class="num">' + n0(r.base) + '</td>' +
            '<td class="num">' + n0(r.tax) + '</td><td class="num">' + (r.adjust ? n0(r.adjust) + '<small>' + esc(r.adjustNotes.join('; ')) + '</small>' : '—') + '</td><td class="num"><b>' + n0(r.total) + '</b></td></tr>' +
            (r.undocumented ? '<tr class="hint-row"><td colspan="7">Расходы без документов: ' + money(r.undocumented) + '. Если найти на них чеки, накладные или ЭСФ, налог станет меньше на ' + money(r.savingIfDocs) + '.</td></tr>' : '');
        }).join('') + '</tbody></table></div>'
      : '<div class="muted">С ' + dateRu(s.taxFrom) + ' операций пока нет.</div>') +
      (thr ? '<div class="nds"><div class="nds-l"><span>Оборот ' + year + ' по учёту' + (first ? ' (данные с ' + dateRu(first) + ')' : '') + '</span><b>' + money(yi) + ' из ' + money(thr) + '</b></div>' +
        '<div class="cb-t"><span style="width:' + Math.min(100, yi / thr * 100).toFixed(1) + '%"></span></div>' +
        '<small>Порог постановки на учёт по НДС. При превышении нужно встать на учёт в течение 10 рабочих дней.</small></div>' : '') +
      '<details class="tax-set"' + (taxSetOpen ? ' open' : '') + '><summary>Параметры расчёта и доначисления</summary>' +
        '<div class="grid3">' +
          field('Ставка ИПН, %', '<input id="s-taxRate" type="number" step="any" data-sbind="taxRate" data-num value="' + esc(s.taxRate) + '">') +
          field('Считать с даты', '<input id="s-taxFrom" type="date" data-sbind="taxFrom" value="' + esc(s.taxFrom) + '">') +
          field('Порог НДС за год', '<input id="s-nds" type="number" data-sbind="ndsThreshold" data-num value="' + esc(s.ndsThreshold) + '">') +
        '</div>' +
        field('Режим (для себя)', '<input id="s-regime" data-sbind="taxRegime" value="' + esc(s.taxRegime) + '">') +
        '<h3>Доначисления и уже начисленные суммы</h3><div class="adjs">' + adj + '</div>' +
        '<button class="btn ghost" data-action="adj-add">+ сумма к месяцу</button>' +
        '<p class="muted small">Взносы за себя (ОПВ, СО, ВОСМС) сюда не входят. Расчёт ориентировочный, перед подачей декларации сверьте с бухгалтером.</p>' +
      '</details>' +
    '</section>';
  }
  var taxSetOpen = false;

  /* ---------- Отчёт для бухгалтера: доходы, расходы, итог налога за месяц ---------- */
  function accReport(btn) {
    var month = finMonth, s = S.settings;
    var tx = S.transactions.filter(function (t) { return (t.date || '').slice(0, 7) === month && (C.CAT[t.category] || {}).type !== 'skip'; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    if (!tx.length) return toast('За ' + monthRu(month) + ' операций нет', true);
    btn.disabled = true;
    loadScript(CDN + 'xlsx/0.18.5/xlsx.full.min.js').then(function () {
      var X = window.XLSX, d = function (iso) { return iso.split('-').reverse().join('.'); };
      var inc = tx.filter(function (t) { return C.CAT[t.category].type === 'income'; });
      var exp = tx.filter(function (t) { return C.CAT[t.category].type === 'expense'; });
      var sum = function (a) { return a.reduce(function (x, t) { return x + Math.abs(+t.amount || 0); }, 0); };
      var tax = C.taxByMonth(S.transactions, s).find(function (r) { return r.month === month; });
      var head = [[s.company || '', ''], ['Период', monthRu(month)], []];
      var wsInc = X.utils.aoa_to_sheet(head.concat([['Дата', 'Плательщик', 'Назначение платежа', 'Сумма, ₸']],
        inc.map(function (t) { return [d(t.date), t.counterparty || '', t.description || '', Math.abs(+t.amount)]; }),
        [[], ['', '', 'Итого доходов', sum(inc)]]));
      var wsExp = X.utils.aoa_to_sheet(head.concat([['Дата', 'Поставщик', 'Что куплено', 'Статья', 'Документ (чек, накладная, ЭСФ)', 'Сумма, ₸']],
        exp.map(function (t) { return [d(t.date), t.counterparty || '', t.description || '', C.CAT[t.category].label, t.doc ? 'есть' : 'нет', Math.abs(+t.amount)]; }),
        [[], ['', '', '', '', 'С документами', sum(exp.filter(function (t) { return t.doc; }))],
         ['', '', '', '', 'Без документов', sum(exp.filter(function (t) { return !t.doc; }))],
         ['', '', '', '', 'Итого расходов', sum(exp)]]));
      var rows = [['Показатель', 'Сумма, ₸'], ['Доходы', sum(inc)], ['Расходы с документами (вычет)', tax ? tax.deductions : 0],
        ['Расходы без документов (не вычитаются)', tax ? tax.undocumented : sum(exp)]];
      if (tax) rows.push(['Налоговая база', tax.base], ['ИПН ' + s.taxRate + '%', tax.tax], ['Доначисления', tax.adjust], ['Итого к уплате (ориентир)', tax.total]);
      else rows.push(['Налог', 'месяц раньше даты начала налогового учёта (' + d(s.taxFrom) + ')']);
      var wsSum = X.utils.aoa_to_sheet(head.concat(rows, [[], [s.taxRegime || ''], ['Личные траты и переводы себе в отчёт не включены. Расчёт ориентировочный.']]));
      wsInc['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 60 }, { wch: 14 }];
      wsExp['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 44 }, { wch: 30 }, { wch: 18 }, { wch: 14 }];
      wsSum['!cols'] = [{ wch: 42 }, { wch: 18 }];
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, wsSum, 'Итог');
      X.utils.book_append_sheet(wb, wsInc, 'Доходы');
      X.utils.book_append_sheet(wb, wsExp, 'Расходы');
      var name = 'Отчёт ' + (s.company || '').replace(/[«»"]/g, '') + ' ' + month + '.xlsx';
      var blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (caps.downloads) return caps.downloads.save({ filename: name, data: blob }).then(function () { toast('Отчёт сохранён'); });
      X.writeFile(wb, name);
    }).catch(function (e) { toast(e && e.code ? 'Скачивание отменено' : 'Отчёт не получился: ' + (e && e.message || 'ошибка'), true); })
      .then(function () { btn.disabled = false; });
  }
  function monthRu(ym) {
    var d = new Date(ym + '-01T00:00:00');
    return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
  }

  // Текст PDF-выписки: собираем строки по координате Y
  async function pdfToText(file, maxPages) {
    await loadScript(CDN + 'pdf.js/3.11.174/pdf.worker.min.js');
    await loadScript(CDN + 'pdf.js/3.11.174/pdf.min.js');
    var pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    var pages = [], images = [];
    for (var n = 1; n <= pdf.numPages; n++) {
      var page = await pdf.getPage(n), content = await page.getTextContent(), rows = {};
      content.items.forEach(function (it) {
        var y = Math.round(it.transform[5]);
        (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
      });
      pages.push(Object.keys(rows).sort(function (a, b) { return b - a; }).map(function (y) {
        return rows[y].sort(function (a, b) { return a.x - b.x; }).map(function (r) { return r.s; }).join(' ').replace(/\s+/g, ' ').trim();
      }).filter(Boolean).join('\n'));
    }
    var text = pages.join('\n');
    if (text.replace(/\s/g, '').length < 80) {
      // Скан без текстового слоя — отправим страницы картинками
      for (var k = 1; k <= Math.min(pdf.numPages, maxPages); k++) {
        var pg = await pdf.getPage(k), vp = pg.getViewport({ scale: 1.6 }), c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        images.push(await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); }));
      }
      text = '';
    }
    return { text: text, images: images };
  }

  function chunkText(text, maxBytes) {
    var out = [], cur = '', enc = new TextEncoder();
    text.split('\n').forEach(function (line) {
      if (enc.encode(cur + line).length > maxBytes && cur) { out.push(cur); cur = ''; }
      cur += line + '\n';
    });
    if (cur.trim()) out.push(cur);
    return out;
  }

  function financePrompt(kind) {
    var orders = S.orders.filter(function (o) { return o.status !== 'отказ'; }).slice(0, 60).map(function (o) {
      return '№' + o.number + ' | ' + (o.client || '—') + ' | ' + (o.phone || '—') + ' | ' + n0((o.totals || {}).price);
    }).join('\n');
    return 'Ты бухгалтер небольшого цеха металлоконструкций в Казахстане. Извлеки денежные операции из ' + kind + '.\n' +
      'Сегодня ' + today() + '. Валюта — тенге.\n\n' +
      'Статьи (id — описание):\n' + C.CATEGORIES.map(function (c) { return c.id + ' — ' + c.label; }).join('\n') + '\n\n' +
      'Заказы (номер | клиент | телефон | сумма):\n' + (orders || '(нет)') + '\n\n' +
      'Правила:\n' +
      '- Чек магазина — одна операция-расход на итоговую сумму. Статья по товарам: электроды, диски, газ, проволока → consumables; труба, лист, уголок, петли, замки, профнастил → metal; краска, грунт, растворитель → paint; АЗС, бензин → fuel.\n' +
      '- Выписка Kaspi: каждая строка с суммой — отдельная операция. «Покупка», «Платёж», исходящий «Перевод» — расход; «Пополнение», входящий перевод — доход. Переводы между своими счетами, снятие наличных, продукты, кафе, одежда → personal.\n' +
      '- Входящий перевод от человека, чьё имя или телефон совпадает с клиентом заказа → category "client" и orderNumber этого заказа.\n' +
      '- Оплату работнику (сварщик, бригада) → labor или install. Если не уверен в статье — other, но не выдумывай.\n' +
      '- amount — положительное число; direction — "income" или "expense"; date — YYYY-MM-DD (год по контексту документа).\n' +
      '- hasDocument: true, если это фискальный чек, накладная или ЭСФ (подтверждает расход для налога); false для строки выписки и оплаты по Kaspi QR без чека.\n\n' +
      'Ответь только JSON: {"operations":[{"date":"2026-10-21","amount":18500,"direction":"expense","category":"fuel","description":"АЗС Helios, АИ-92","counterparty":"Helios","orderNumber":null,"hasDocument":true}]}';
  }

  async function runFinance() {
    var text = (($('#fin-text') || {}).value || '').trim();
    if (!finFiles.length && !text) { $('#fin-status').textContent = 'Выберите файлы или вставьте текст.'; return; }
    finBusy = true; render();
    var status = function (m) { var el = $('#fin-status'); if (el) el.textContent = m; };
    var lim = {};
    try { lim = await caps.sample.limits(); } catch (e) { /* лимиты по умолчанию */ }
    var maxImg = lim.images ? lim.images.maxCount : 0, maxBytes = Math.max(8000, Math.min(40000, (lim.maxPromptBytes || 60000) - 12000));
    var jobs = [];
    if (text) chunkText(text, maxBytes).forEach(function (t) { jobs.push({ kind: 'текста', text: t, source: 'текст' }); });
    for (var i = 0; i < finFiles.length; i++) {
      var f = finFiles[i];
      try {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          status('Читаю ' + f.name + '…');
          var r = await pdfToText(f, Math.max(1, maxImg));
          if (r.text) chunkText(r.text, maxBytes).forEach(function (t) { jobs.push({ kind: 'банковской выписки', text: t, source: f.name }); });
          else if (maxImg) jobs.push({ kind: 'скана выписки', images: r.images, source: f.name });
        } else if (maxImg) {
          var img = await shrinkImage(f, 1800).catch(function () { return f; });
          jobs.push({ kind: 'фото чека или скриншота', images: [img], source: f.name, doc: true });
        }
      } catch (e) { toast('Не прочитался файл ' + f.name + ': ' + e.message, true); }
    }
    var found = 0, failed = 0;
    for (var j = 0; j < jobs.length; j++) {
      status('Распознаю ' + (j + 1) + ' из ' + jobs.length + '…');
      var job = jobs[j];
      try {
        var prompt = financePrompt(job.kind) + (job.text ? '\n\nДАННЫЕ:\n' + job.text : '');
        var res = await caps.sample.json(prompt, job.images ? { images: job.images } : {});
        (res && res.operations || []).forEach(function (op) { if (addStaged(op, job.source, !!job.doc)) found++; });
      } catch (e) {
        failed++;
        if (e && e.code === 'not_granted') { status('Нет разрешения на запрос к Claude.'); break; }
        if (e && e.code === 'rate_limited') { status('Слишком много запросов, продолжите через минуту.'); break; }
      }
    }
    finBusy = false; finFiles = []; render();
    toast(found ? 'Найдено операций: ' + found + (failed ? ', не распознано частей: ' + failed : '') + '. Проверьте и сохраните.' : 'Операций не найдено' + (failed ? ' (ошибок: ' + failed + ')' : ''), !found);
  }

  function addStaged(op, source, docDefault) {
    var amount = Math.abs(parseFloat(String(op.amount).replace(/\s/g, '').replace(',', '.')));
    if (!amount) return false;
    var dir = op.direction === 'income' ? 'income' : 'expense';
    var cat = C.CAT[op.category] ? op.category : (dir === 'income' ? 'income_other' : 'other');
    if (C.CAT[cat].type === 'income' && dir === 'expense') cat = 'other';
    if (C.CAT[cat].type === 'expense' && dir === 'income') cat = 'income_other';
    var ord = op.orderNumber != null && S.orders.find(function (o) { return String(o.number) === String(op.orderNumber).replace(/\D/g, ''); });
    var date = /^\d{4}-\d{2}-\d{2}$/.test(op.date || '') ? op.date : today();
    var dup = S.transactions.concat(staged).some(function (t) { return t.date === date && Math.abs(+t.amount - amount) < 0.5; });
    staged.push({ id: uid('tx'), date: date, amount: amount, direction: dir, category: cat, description: op.description || '', counterparty: op.counterparty || '',
      orderId: ord ? ord.id : '', source: source, include: !dup && cat !== 'personal', dup: dup,
      doc: dir === 'expense' && (typeof op.hasDocument === 'boolean' ? op.hasDocument : docDefault) });
    return true;
  }

  /* ================= Привязка полей ================= */
  function setPath(obj, path, val) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  function readVal(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.hasAttribute('data-num')) { var v = parseFloat(String(el.value).replace(',', '.')); return isNaN(v) ? '' : v; }
    return el.value;
  }

  function onInput(e) {
    var el = e.target, v;
    if (el.dataset.bind) {
      setPath(draft, el.dataset.bind, readVal(el)); saveDraft();
      if (el.hasAttribute('data-struct')) render(); else refreshCalc();
    } else if (el.dataset.tbind) {
      setPath(editTpl, el.dataset.tbind, readVal(el)); refreshTpl(); saveTpl();
    } else if (el.dataset.sbind) {
      setPath(S.settings, el.dataset.sbind, readVal(el));
      setOut('ohk', money((S.settings.fixedCosts || []).reduce(function (a, f) { return a + (+f.amount || 0); }, 0)) + ' в месяц → <b>' + money(C.overheadPerKg(S.settings)) + ' на 1 кг</b>');
      later('settings', Store.saveSettings, 600);
    } else if (el.dataset.mbind) {
      var parts = el.dataset.mbind.split('|'), m = S.materials.find(function (x) { return x.id === parts[0]; });
      if (!m) return;
      v = readVal(el); setPath(m, parts[1], v);
      if (parts[1] === 'kind') { m.unit = C.unitOf(v) || m.unit || 'шт'; render(); }
      setOut('mkg-' + m.id, C.fmtNum(C.materialKg(m), 2));
      setOut('mp-' + m.id, money(C.unitPrice(m)));
      later('mat-' + m.id, function () { if (m.supplier) m.priceDate = m.priceDate > today() ? m.priceDate : today(); Store.put('materials', clone(m)); }, 600);
    } else if (el.id === 'mat-q' || el.id === 'mat-sup') {
      if (el.id === 'mat-q') matQuery = el.value; else matSup = el.value;
      later('matq', function () { render(); var f = $('#mat-q'); if (f && el.id === 'mat-q') { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, el.id === 'mat-q' ? 250 : 0);
    } else if (el.id === 'ord-filter') {
      ordFilter = el.value; render();
    } else if (el.id === 'ai-file') {
      aiFile = el.files && el.files[0] || null;
      $('#ai-file-name').textContent = aiFile ? aiFile.name : 'Выбрать фото или эскиз';
    } else if (el.id === 'restore-file') {
      restore(el.files && el.files[0]);
    } else if (el.id === 'logo-file') {
      setLogo(el.files && el.files[0]);
    } else if (el.dataset.xbind) {
      var xb = el.dataset.xbind.split('|'); staged[xb[0]][xb[1]] = readVal(el);
      if (xb[1] === 'category') { var c = C.CAT[staged[xb[0]].category]; staged[xb[0]].direction = c && c.type === 'income' ? 'income' : 'expense'; render(); }
      else if (xb[1] === 'include') setOut('stage-count', String(staged.filter(function (x) { return x.include; }).length));
    } else if (el.dataset.tx) {
      var tb = el.dataset.tx.split('|'), t = S.transactions.find(function (x) { return x.id === tb[0]; });
      if (!t) return;
      t[tb[1]] = readVal(el);
      if (tb[1] === 'category') { var cc = C.CAT[t.category]; t.direction = cc && cc.type === 'income' ? 'income' : 'expense'; }
      later('tx-' + t.id, function () { Store.put('transactions', clone(t)); if (tb[1] !== 'description') render(); }, 500);
    } else if (el.id === 'fin-month') {
      finMonth = el.value || finMonth; render();
    } else if (el.id === 'fin-cat') {
      finCat = el.value; render();
    } else if (el.id === 'coef-months') {
      coefMonths = +el.value || 3; render();
    } else if (el.id === 'fin-files') {
      finFiles = Array.prototype.slice.call(el.files || []);
      setOut('fin-files-name', finFiles.length ? finFiles.map(function (f) { return esc(f.name); }).join(', ') : 'Выбрать фото чеков или выписку (PDF)');
    }
  }

  /* ================= Действия ================= */
  var actions = {
    'seed': seedDefaults,
    'new-draft': function () { draft = newDraft(); saveDraft(); render(); },
    'add-tpl': function () {
      var t = S.templates.find(function (x) { return x.id === $('#add-tpl').value; });
      if (!t) return toast('Сначала создайте шаблон во вкладке «Шаблоны»', true);
      draft.items.push(itemFromTemplate(t)); saveDraft(); render();
    },
    'add-blank': function () {
      draft.items.push({ id: uid('it'), name: 'Изделие', params: [], values: {}, count: 1, parts: [{ materialId: '', n: '', len: '', qty: '', note: '' }], laborHours: '' });
      saveDraft(); render();
    },
    'ai-open': function () { aiOpen = true; render(); var t = $('#ai-text'); if (t) t.focus(); },
    'ai-close': function () { aiOpen = false; render(); },
    'ai-run': runAi,
    'add-part': function (b) { draft.items[b.dataset.i].parts.push({ materialId: '', qty: '', note: '' }); saveDraft(); render(); },
    'del-part': function (b) { draft.items[b.dataset.i].parts.splice(b.dataset.j, 1); saveDraft(); render(); },
    'del-item': function (b) { draft.items.splice(b.dataset.i, 1); saveDraft(); render(); },
    'dup-item': function (b) { var c = clone(draft.items[b.dataset.i]); c.id = uid('it'); draft.items.splice(+b.dataset.i + 1, 0, c); saveDraft(); render(); },
    'item-to-tpl': function (b) {
      var it = draft.items[b.dataset.i];
      var existing = it.templateId && S.templates.find(function (t) { return t.id === it.templateId; });
      var t = {
        id: existing ? existing.id : uid('tpl'), name: it.name, category: existing ? existing.category : '',
        params: clone(it.params || []).map(function (p) { p.def = C.paramVars(it.params, it.values)[p.key]; return p; }),
        parts: clone(it.parts).filter(function (p) { return p.materialId; }), laborHours: it.laborHours || '', laborCost: it.laborCost || ''
      };
      it.templateId = t.id;
      Store.put('templates', t); saveDraft(); render();
      toast(existing ? 'Шаблон обновлён' : 'Шаблон сохранён. Добавьте параметры (W, H) во вкладке «Шаблоны», чтобы он считался от размеров');
    },
    'add-extra': function () { draft.extras.push({ name: '', amount: '' }); saveDraft(); render(); },
    'del-extra': function (b) { draft.extras.splice(b.dataset.i, 1); saveDraft(); render(); },
    'save-order': function () {
      if (!draft.items.length) return toast('Добавьте хотя бы одно изделие', true);
      var R = C.calcOrder(draft, S.materials, S.settings);
      var o = clone(draft);
      if (!o.number) o.number = nextNumber();
      if (!o.createdAt) o.createdAt = new Date().toISOString();
      o.updatedAt = new Date().toISOString();
      o.totals = { kg: R.kg, cost: R.cost, price: R.price, profit: R.profit, rows: R.rows.map(function (r) { return { label: r.label, value: r.value }; }) };
      o.materialsSnapshot = materialsUsed(o);
      draft.number = o.number; draft.createdAt = o.createdAt;
      Store.put('orders', o); saveDraft(); render();
      toast('Заказ № ' + o.number + ' сохранён');
    },
    'copy-kp': function () { copyText(kpText()); },
    'csv': function () {
      caps.downloads.save({ filename: 'smeta-' + (draft.number || 'raschet') + '.csv', data: '﻿' + csvText() })
        .catch(function () { toast('Скачивание отменено', true); });
    },
    'open-order': function (b) {
      var o = S.orders.find(function (x) { return x.id === b.dataset.id; }); if (!o) return;
      draft = clone(o); delete draft.totals; delete draft.materialsSnapshot;
      kpOpen = false; saveDraft(); view = 'calc'; render(); window.scrollTo(0, 0);
    },
    'copy-order': function (b) {
      var o = S.orders.find(function (x) { return x.id === b.dataset.id; }); if (!o) return;
      draft = clone(o); draft.id = uid('ord'); draft.number = ''; draft.createdAt = ''; draft.status = 'расчёт';
      delete draft.totals; delete draft.materialsSnapshot;
      saveDraft(); view = 'calc'; render(); toast('Копия заказа — пересчитана по текущим ценам');
    },
    'del-order': armedAction(function (id) { Store.remove('orders', id); }),
    'new-tpl': function () {
      editTpl = { id: uid('tpl'), name: 'Новое изделие', category: '', params: [{ key: 'W', label: 'Ширина, м', def: 1 }, { key: 'H', label: 'Высота, м', def: 1 }], parts: [{ materialId: '', qty: '2*W+2*H', note: '' }], laborHours: '' };
      Store.put('templates', clone(editTpl)); render();
    },
    'edit-tpl': function (b) { var t = S.templates.find(function (x) { return x.id === b.dataset.id; }); editTpl = t ? clone(t) : null; render(); },
    'tpl-back': function () { flushTpl(); editTpl = null; render(); },
    'tpl-use': function () { flushTpl(); draft.items.push(itemFromTemplate(editTpl)); saveDraft(); editTpl = null; view = 'calc'; render(); },
    'tpl-delete': armedAction(function (id) { Store.remove('templates', id); editTpl = null; }),
    'tpl-add-param': function () { editTpl.params = editTpl.params || []; editTpl.params.push({ key: 'P' + (editTpl.params.length + 1), label: '', def: 1 }); saveTpl(); render(); },
    'tpl-del-param': function (b) { editTpl.params.splice(b.dataset.i, 1); saveTpl(); render(); },
    'tpl-add-part': function () { editTpl.parts.push({ materialId: '', qty: '', note: '' }); saveTpl(); render(); },
    'tpl-del-part': function (b) { editTpl.parts.splice(b.dataset.i, 1); saveTpl(); render(); },
    'add-mat': function () {
      var m = { id: uid('mat'), name: 'Профтруба 50×25×2', kind: 'rect', dims: { a: 50, b: 25, t: 2 }, price: S.materials[0] ? S.materials[0].price : 420, priceMode: 'kg', unit: 'м' };
      Store.put('materials', m); if (storeMode !== 'db') render();
    },
    'del-mat': armedAction(function (id) { Store.remove('materials', id); }),
    'bulk-price': function () {
      var pct = parseFloat(String($('#bulk-pct').value).replace(',', '.')), bulkSup = $('#bulk-sup') ? $('#bulk-sup').value : '';
      if (!pct) return toast('Введите процент, например 5 или −3', true);
      var n = 0;
      S.materials.forEach(function (m) {
        if (m.priceMode === 'kg' || (bulkSup && m.supplier === bulkSup)) {
          m.price = Math.round(m.price * (1 + pct / 100) * 100) / 100;
          if (m.supplier) m.priceDate = today();
          Store.put('materials', clone(m)); n++;
        }
      });
      render(); toast('Цены обновлены у ' + n + ' позиций');
    },
    'add-fixed': function () { S.settings.fixedCosts = S.settings.fixedCosts || []; S.settings.fixedCosts.push({ name: '', amount: 0 }); Store.saveSettings(); render(); },
    'del-fixed': function (b) { S.settings.fixedCosts.splice(b.dataset.i, 1); Store.saveSettings(); render(); },
    'backup': function () {
      caps.downloads.save({ filename: 'metal-calc-backup-' + new Date().toISOString().slice(0, 10) + '.json', data: JSON.stringify(S, null, 1) })
        .catch(function () { toast('Скачивание отменено', true); });
    },
    'backup-copy': function () { copyText(JSON.stringify(S)); },
    'copy-cut': function () { copyText(cutText()); },
    'kp-open': function () { kpOpen = true; render(); var k = $('#kp-preview'); if (k) k.scrollIntoView({ block: 'start' }); },
    'kp-close': function () { kpOpen = false; render(); },
    'kp-pdf': kpPdf,
    'logo-del': function () { delete S.settings.logo; Store.saveSettings(); render(); },
    'fin-run': runFinance,
    'acc-report': accReport,
    'adj-add': function () { S.settings.taxAdjustments = S.settings.taxAdjustments || []; S.settings.taxAdjustments.push({ month: finMonth, amount: 0, note: '' }); Store.saveSettings(); render(); },
    'adj-del': function (b) { S.settings.taxAdjustments.splice(b.dataset.i, 1); Store.saveSettings(); render(); },
    'fin-filter': function (b) { finCat = finCat === b.dataset.id ? '' : b.dataset.id; render(); },
    'stage-add': function () {
      staged.push({ id: uid('tx'), date: today(), amount: '', direction: 'expense', category: 'metal', description: '', counterparty: '', orderId: '', source: 'вручную', include: true });
      render();
    },
    'stage-clear': function () { staged = []; render(); },
    'stage-save': function () {
      var keep = staged.filter(function (x) { return x.include && +x.amount; });
      keep.forEach(function (x) {
        var t = clone(x); delete t.include; delete t.dup;
        t.amount = Math.abs(+t.amount); t.createdAt = new Date().toISOString();
        Store.put('transactions', t);
      });
      sortTx();
      staged = []; render(); toast('Сохранено операций: ' + keep.length);
    },
    'del-tx': armedAction(function (id) { Store.remove('transactions', id); }),
    'pf-add': function () {
      var amt = parseFloat(String($('#pf-amount').value).replace(',', '.'));
      if (!amt) return toast('Введите сумму', true);
      var cat = $('#pf-cat').value, c = C.CAT[cat];
      var t = { id: uid('tx'), date: today(), amount: Math.abs(amt), direction: c.type === 'income' ? 'income' : 'expense', category: cat,
        description: $('#pf-desc').value || c.label, counterparty: '', orderId: draft.id, source: 'вручную', createdAt: new Date().toISOString() };
      Store.put('transactions', t);
      if (storeMode !== 'db') { sortTx(); render(); }
      toast('Записано в заказ');
    },
    'coef-apply': function (b) {
      S.settings[b.dataset.key] = Math.round(+b.dataset.val); Store.saveSettings(); render(); toast('Коэффициент обновлён');
    },
    'coef-fixed': function () {
      var sug = C.suggestCoefficients(S.transactions, S.orders, S.settings, coefMonths);
      S.settings.fixedCosts = sug.fixedCosts; Store.saveSettings(); render(); toast('Постоянные расходы заменены на средние по факту');
    }
  };

  function armedAction(fn) {
    return function (b) {
      var key = b.dataset.action + ':' + b.dataset.id;
      if (armed !== key) { armed = key; render(); later('disarm', function () { armed = null; render(); }, 4000); return; }
      armed = null; fn(b.dataset.id); render();
    };
  }
  function flushTpl() { if (editTpl) { clearTimeout(timers.tpl); Store.put('templates', clone(editTpl)); } }

  function nextNumber() {
    var max = S.orders.reduce(function (a, o) { var n = parseInt(o.number, 10); return isNaN(n) ? a : Math.max(a, n); }, 0);
    return String(max + 1);
  }
  function materialsUsed(o) {
    var ids = {};
    o.items.forEach(function (it) { (it.parts || []).forEach(function (p) { ids[p.materialId] = 1; }); });
    return S.materials.filter(function (m) { return ids[m.id]; }).map(function (m) { return { id: m.id, name: m.name, price: m.price, priceMode: m.priceMode }; });
  }

  function restore(file) {
    if (!file) return;
    file.text().then(function (t) {
      var d = JSON.parse(t);
      if (!d.materials || !d.settings) throw new Error('В файле нет каталога');
      d.materials.forEach(function (m) { Store.put('materials', m); });
      (d.templates || []).forEach(function (x) { Store.put('templates', x); });
      (d.orders || []).forEach(function (x) { Store.put('orders', x); });
      S.settings = Object.assign(clone(C.DEFAULT_SETTINGS), d.settings); Store.saveSettings();
      if (storeMode !== 'db') { S = d; saveLocal(); }
      render(); toast('Восстановлено из копии');
    }).catch(function (e) { toast('Не получилось прочитать файл: ' + e.message, true); });
  }

  /* ---------- КП и смета ---------- */
  function kpText() {
    var R = C.calcOrder(draft, S.materials, S.settings), s = S.settings, o = draft.options;
    var lines = ['*' + (s.company || 'Коммерческое предложение') + '*',
      'Расчёт' + (draft.number ? ' № ' + draft.number : '') + ' от ' + new Date().toLocaleDateString('ru-RU')];
    if (draft.client) lines.push('Для: ' + draft.client);
    lines.push('');
    draft.items.forEach(function (it, i) {
      var vals = (it.params || []).map(function (p) { return p.label.replace(/,.*$/, '') + ' ' + C.fmtNum(C.paramVars(it.params, it.values)[p.key], 2) + ' м'; }).join(', ');
      lines.push((i + 1) + '. ' + it.name + (vals ? ' (' + vals + ')' : '') + ' — ' + it.count + ' шт');
    });
    lines.push('');
    var incl = ['изготовление', 'металл'];
    if (o.paint) incl.push('грунт и покраска');
    if (o.install) incl.push('монтаж');
    if (+o.trips) incl.push('доставка');
    lines.push('В стоимость входит: ' + incl.join(', ') + '.');
    if (s.leadDays) lines.push('Срок изготовления: ' + s.leadDays + ' раб. дней.');
    lines.push('*Итого: ' + money(R.price).replace(/&[^;]+;/g, '') + '*');
    if (s.phone) lines.push('', 'Тел.: ' + s.phone);
    return lines.join('\n');
  }

  function csvText() {
    var R = C.calcOrder(draft, S.materials, S.settings);
    var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var num = function (v, d) { return (+v || 0).toFixed(d == null ? 0 : d).replace('.', ','); };
    var out = [['Смета', draft.number ? '№ ' + draft.number : '', draft.client].map(q).join(';'), ''];
    out.push(['Изделие', 'Материал', 'Кол-во', 'Ед.', 'кг', 'Сумма', 'Примечание'].join(';'));
    R.items.forEach(function (ir, i) {
      var it = draft.items[i];
      ir.lines.forEach(function (l) {
        out.push([itemTitle(it) + ' ×' + it.count, l.material ? l.material.name : '?', num(l.qty * it.count, 2), l.material ? l.material.unit : '', num(l.kg * it.count, 1), num(l.cost * it.count), l.part.note].map(q).join(';'));
      });
    });
    out.push('', 'Статья;Сумма');
    R.rows.forEach(function (r) { out.push(q(r.label) + ';' + num(r.value)); });
    out.push('Себестоимость;' + num(R.cost), 'Наценка;' + num(R.margin), 'Скидка;' + num(R.discount), 'Цена;' + num(R.price), 'Прибыль;' + num(R.profit));
    out.push('', 'Закупка;Кол-во с запасом;Ед.;кг;Сумма');
    buyList(R).forEach(function (b) { out.push([b.name, num(b.qtyW, 2), b.unit, num(b.kg, 1), num(b.cost)].map(q).join(';')); });
    return out.join('\r\n');
  }

  function copyText(t) {
    var done = function () { toast('Скопировано — вставьте в WhatsApp или заметки'); };
    try {
      navigator.clipboard.writeText(t).then(done, fallback);
    } catch (e) { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = t; ta.className = 'copy-fallback';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Выделите текст и скопируйте вручную', true); return; }
      ta.remove();
    }
  }

  var toastTimer;
  function toast(msg, bad) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 3500);
  }

  /* ================= Запуск ================= */
  function start() {
    loadLocal();
    draft = lsGet(LS_DRAFT) || newDraft();
    if (!draft.items.length && S.templates[0]) draft.items.push(itemFromTemplate(S.templates[0]));
    document.addEventListener('input', onInput);
    document.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('tax-set')) taxSetOpen = e.target.open; }, true);
    // Налог пересчитываем, когда поле параметров отпустили, чтобы не сбивать ввод
    document.addEventListener('change', function (e) { if (view === 'money' && e.target.dataset && e.target.dataset.sbind) render(); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (b && e.target.closest('button') && e.target.closest('button') !== b) return;
      if (e.target.closest('[data-view]')) {
        flushTpl();
        view = e.target.closest('[data-view]').dataset.view; editTpl = null; render(); return;
      }
      if (b && actions[b.dataset.action] && !b.disabled) actions[b.dataset.action](b);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('tr[data-action], article[data-action]')) actions[e.target.dataset.action](e.target);
    });
    render();

    if (window.claude && window.claude.use) {
      window.claude.use('db').then(function (db) { if (db) { caps.db = db; connectDb(); } });
      window.claude.use('sample').then(function (s) {
        if (!s) return;
        caps.sample = s;
        s.limits().then(function (l) { caps.images = !!(l && l.images); render(); }).catch(function () { render(); });
      });
      window.claude.use('downloads').then(function (d) { if (d) { caps.downloads = d; render(); } });
    }
  }
  start();
})();
