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

  var S = { settings: clone(C.DEFAULT_SETTINGS), materials: [], templates: [], orders: [] };
  var draft = null;
  var view = 'calc';
  var editTpl = null;
  var caps = { db: null, sample: null, downloads: null, images: false };
  var storeMode = 'local';
  var ready = { materials: false, templates: false, orders: false, settings: false };

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
  function later(key, fn, ms) { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms || 500); }

  function loadLocal() {
    var saved = lsGet(LS_KEY);
    if (saved && saved.materials) {
      S = saved;
      S.settings = Object.assign(clone(C.DEFAULT_SETTINGS), saved.settings || {});
    } else {
      S.materials = clone(C.DEFAULT_MATERIALS);
      S.templates = clone(C.DEFAULT_TEMPLATES);
      saveLocal();
    }
  }

  function connectDb() {
    storeMode = 'db';
    ['materials', 'templates', 'orders'].forEach(function (coll) {
      caps.db.collection(coll).onSnapshot(function (snap) {
        S[coll] = snap.docs.map(function (d) { return d.data(); });
        if (coll === 'orders') S.orders.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
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
    S.materials.forEach(function (m) { (groups[kindLabel(m.kind)] = groups[kindLabel(m.kind)] || []).push(m); });
    var out = '<option value="">— выберите —</option>';
    Object.keys(groups).forEach(function (g) {
      out += '<optgroup label="' + esc(g) + '">' + groups[g].sort(function (a, b) { return a.name.localeCompare(b.name, 'ru', { numeric: true }); }).map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    return out;
  }

  var KINDS = { rect: 'Труба профильная', square: 'Труба квадратная', round: 'Труба круглая', angle: 'Уголок', strip: 'Полоса', rod: 'Круг / арматура', sheet: 'Лист', custom: 'Прочее (вес и цена вручную)' };
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
        aiPanel() +
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
        '<td><input id="it-' + i + '-q-' + j + '" class="formula" data-bind="items.' + i + '.parts.' + j + '.qty" value="' + esc(p.qty) + '"></td>' +
        '<td class="unit" data-out="u-' + i + '-' + j + '"></td>' +
        '<td class="num" data-out="kg-' + i + '-' + j + '"></td>' +
        '<td class="num" data-out="c-' + i + '-' + j + '"></td>' +
        '<td><input id="it-' + i + '-n-' + j + '" data-bind="items.' + i + '.parts.' + j + '.note" value="' + esc(p.note) + '" placeholder="примечание"></td>' +
        '<td><button class="icon" data-action="del-part" data-i="' + i + '" data-j="' + j + '" aria-label="Удалить деталь">×</button></td>' +
      '</tr>';
    }).join('');
    var hint = (it.params || []).length ? 'Параметры в формулах: ' + it.params.map(function (p) { return '<code>' + esc(p.key) + '</code>'; }).join(', ') : 'Количество — число или формула';

    return '<article class="item">' +
      '<div class="item-head">' +
        '<input id="it-' + i + '-name" class="item-name" data-bind="items.' + i + '.name" value="' + esc(it.name) + '" aria-label="Название изделия">' +
        '<label class="count">×<input id="it-' + i + '-count" type="number" min="1" data-bind="items.' + i + '.count" data-num value="' + esc(it.count) + '" aria-label="Количество"> шт</label>' +
      '</div>' +
      (it.aiNote ? '<div class="ai-note">' + esc(it.aiNote) + '</div>' : '') +
      (params ? '<div class="params">' + params + '</div>' : '') +
      '<div class="scroll"><table class="parts"><thead><tr><th>Материал</th><th>Кол-во / формула</th><th>ед.</th><th class="num">кг</th><th class="num">' + cur() + '</th><th>Примечание</th><th></th></tr></thead>' +
      '<tbody>' + parts + '</tbody></table></div>' +
      '<div class="item-foot">' +
        '<span class="hint">' + hint + '</span>' +
        '<label class="hours">Доп. часы работы <input id="it-' + i + '-h" class="formula short" data-bind="items.' + i + '.laborHours" value="' + esc(it.laborHours || '') + '" placeholder="0"></label>' +
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
        setOut('u-' + i + '-' + j, l.material ? l.material.unit : '');
        setOut('kg-' + i + '-' + j, l.error ? '<span class="err" title="' + esc(l.error) + '">ошибка</span>' : C.fmtNum(l.kg, 1));
        setOut('c-' + i + '-' + j, l.error ? '' : n0(l.cost) + '<small>' + C.fmtNum(l.qty, 2) + ' ' + esc(l.material ? l.material.unit : '') + '</small>');
      });
      setOut('it-' + i, C.fmtNum(ir.kg, 1) + ' кг · металл ' + money(ir.metalCost));
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
        '<button class="btn" data-action="copy-kp">Скопировать КП для WhatsApp</button>' +
        (caps.downloads ? '<button class="btn" data-action="csv">Скачать смету (CSV)</button>' : '') +
      '</div>';

    var buy = buyList(R);
    $('#buy').innerHTML = buy.length ? '<table class="data"><thead><tr><th>Материал</th><th class="num">Нужно</th><th class="num">С запасом ' + esc(S.settings.wastePct) + '%</th><th class="num">кг</th><th class="num">' + cur() + '</th></tr></thead><tbody>' +
      buy.map(function (b) {
        return '<tr><td>' + esc(b.name) + '</td><td class="num">' + C.fmtNum(b.qty, 2) + ' ' + esc(b.unit) + '</td><td class="num">' + C.fmtNum(b.qtyW, 2) + ' ' + esc(b.unit) +
          (b.bars ? '<small>≈ ' + b.bars + ' хлыст. по 6 м</small>' : '') + '</td><td class="num">' + C.fmtNum(b.kg, 1) + '</td><td class="num">' + n0(b.cost) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="muted">Здесь появится сводка металла по всем изделиям — список для закупки.</div>';
  }

  function buyList(R) {
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
      if (a.unit === 'м' && a.kind !== 'custom') a.bars = Math.ceil(a.qtyW / 6);
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
      '- Если изделие по смыслу совпадает с шаблоном, верни templateId и values (числа в метрах для каждого параметра), parts оставь пустым.\n' +
      '- Иначе templateId = null и перечисли детали: materialId строго из каталога, qty — количество в единицах материала (метры, м², шт), можно числом или формулой из чисел.\n' +
      '- Размеры, которых не видно, прими типовыми и запиши в assumptions. Не выдумывай материалы вне каталога: если нужного нет, возьми ближайший и укажи это в assumptions.\n' +
      '- Учитывай столбы с заглублением, перемычки, рёбра жёсткости, обшивку.\n\n' +
      'Ответь ТОЛЬКО JSON без пояснений:\n' +
      '{"name": "краткое название изделия", "count": 1, "templateId": "id или null", "values": {"W": 3.5}, ' +
      '"parts": [{"materialId": "id", "qty": 12.5, "note": "что это"}], "assumptions": ["…"], "questions": ["что уточнить у клиента"]}';

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
            return { materialId: String(p.materialId), qty: String(p.qty == null ? '' : p.qty), note: p.note || '' };
          }) };
      }
      it.count = Math.max(1, +r.count || 1);
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
    '</section>' +
    '<section class="panel">' +
      '<div class="panel-head"><h2>Заказы</h2><div class="row">' +
        '<select id="ord-filter" aria-label="Фильтр по статусу"><option value="">Все статусы</option>' + ['расчёт', 'согласован', 'в работе', 'сдан', 'отказ'].map(function (s) {
          return '<option' + (s === ordFilter ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '</div></div>' +
      (list.length ? '<div class="scroll"><table class="data orders"><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Изделия</th><th class="num">кг</th><th class="num">Цена</th><th>Статус</th><th></th></tr></thead><tbody>' +
        list.map(function (o) {
          return '<tr data-action="open-order" data-id="' + esc(o.id) + '" tabindex="0">' +
            '<td>' + esc(o.number) + '</td><td>' + esc((o.createdAt || '').slice(0, 10).split('-').reverse().join('.')) + '</td>' +
            '<td>' + esc(o.client || '—') + (o.phone ? '<small>' + esc(o.phone) + '</small>' : '') + '</td>' +
            '<td class="wrap">' + esc((o.items || []).map(function (it) { return itemTitle(it) + (it.count > 1 ? ' ×' + it.count : ''); }).join(', ')) + '</td>' +
            '<td class="num">' + C.fmtNum((o.totals || {}).kg, 0) + '</td><td class="num">' + n0((o.totals || {}).price) + '</td>' +
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
        '<td><input id="tq-q-' + j + '" class="formula" data-tbind="parts.' + j + '.qty" value="' + esc(p.qty) + '"></td>' +
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
      '<p class="muted">Количество — формула от параметров. Пример: <code>2*W+2*H</code> — периметр рамы; <code>ceil(L/0,8)+1</code> — число лаг с шагом 0,8 м; <code>max(H;2)</code>. Разделитель аргументов — точка с запятой.</p>' +
      '<div class="scroll"><table class="parts"><thead><tr><th>Материал</th><th>Формула</th><th class="num">При значениях по умолчанию</th><th>Примечание</th><th></th></tr></thead><tbody>' + parts + '</tbody></table></div>' +
      '<button class="btn ghost" data-action="tpl-add-part">+ деталь</button>' +
      '<div class="field short-field">' + '<label class="lbl" for="tp-h">Доп. часы работы (формула)</label><input id="tp-h" class="formula" data-tbind="laborHours" value="' + esc(t.laborHours || '') + '"></div>' +
      '<div class="tpl-total" data-out="tpl-total"></div>' +
    '</section>';
  }

  function refreshTpl() {
    var it = itemFromTemplate(editTpl); var r = C.calcItem(it, S.materials);
    r.lines.forEach(function (l, j) {
      setOut('tq-' + j, l.error ? '<span class="err" title="' + esc(l.error) + '">' + esc(l.error) + '</span>' :
        C.fmtNum(l.qty, 2) + ' ' + esc(l.material ? l.material.unit : '') + ' · ' + C.fmtNum(l.kg, 1) + ' кг');
    });
    setOut('tpl-total', 'Итого при значениях по умолчанию: <b>' + C.fmtNum(r.kg, 1) + ' кг</b>, металл <b>' + money(r.metalCost) + '</b>' +
      (r.errors ? ' · <span class="err">ошибок: ' + r.errors + '</span>' : ''));
  }

  function saveTpl() { later('tpl', function () { if (editTpl) Store.put('templates', clone(editTpl)); }, 600); }

  /* ---------- Материалы ---------- */
  function viewMaterials() {
    var rows = S.materials.slice().sort(function (a, b) { return (a.kind || '').localeCompare(b.kind || '') || a.name.localeCompare(b.name, 'ru', { numeric: true }); }).map(function (m) {
      var id = esc(m.id), d = m.dims || {};
      var dim = function (k, ph) { return '<input id="m-' + id + '-' + k + '" class="dim" type="number" step="0.1" data-mbind="' + id + '|dims.' + k + '" data-num value="' + esc(d[k] == null ? '' : d[k]) + '" placeholder="' + ph + '" aria-label="' + ph + '">'; };
      var dims = { rect: dim('a', 'A') + dim('b', 'B') + dim('t', 't'), square: dim('a', 'A') + dim('t', 't'), round: dim('d', 'D') + dim('t', 't'),
        angle: dim('a', 'A') + dim('b', 'B') + dim('t', 't'), strip: dim('a', 'ширина') + dim('t', 't'), rod: dim('d', 'Ø'), sheet: dim('t', 't') }[m.kind];
      return '<tr>' +
        '<td><input id="m-' + id + '-name" data-mbind="' + id + '|name" value="' + esc(m.name) + '"></td>' +
        '<td><select id="m-' + id + '-kind" data-mbind="' + id + '|kind" data-struct>' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (k === m.kind ? ' selected' : '') + '>' + KINDS[k] + '</option>'; }).join('') + '</select></td>' +
        '<td class="dims">' + (dims || '<input id="m-' + id + '-unit" class="dim" data-mbind="' + id + '|unit" value="' + esc(m.unit) + '" aria-label="Единица">') + '</td>' +
        '<td class="num">' + (m.kind === 'custom' ? '<input id="m-' + id + '-kg" class="dim" type="number" step="0.01" data-mbind="' + id + '|kgPerUnit" data-num value="' + esc(m.kgPerUnit) + '" aria-label="кг на единицу">' : '<span data-out="mkg-' + id + '">' + C.fmtNum(C.materialKg(m), 2) + '</span>') + '<small>кг/' + esc(m.unit) + '</small></td>' +
        '<td class="price-cell"><input id="m-' + id + '-price" class="num" type="number" data-mbind="' + id + '|price" data-num value="' + esc(m.price) + '" aria-label="Цена">' +
          '<select id="m-' + id + '-pm" data-mbind="' + id + '|priceMode" aria-label="За что цена"><option value="kg"' + (m.priceMode === 'kg' ? ' selected' : '') + '>за кг</option><option value="unit"' + (m.priceMode !== 'kg' ? ' selected' : '') + '>за ' + esc(m.unit) + '</option></select></td>' +
        '<td class="num" data-out="mp-' + id + '">' + money(C.unitPrice(m)) + '</td>' +
        '<td>' + confirmBtn('del-mat', m.id, '×') + '</td>' +
      '</tr>';
    }).join('');
    return '<section class="panel">' +
      '<div class="panel-head"><h2>Каталог металла</h2><div class="row">' +
        '<button class="btn primary" data-action="add-mat">Добавить материал</button></div></div>' +
      '<p class="muted">Вес трубы, уголка, листа и круга считается по размерам в миллиметрах (по ГОСТ, с учётом скруглений). Для прочего — петли, замки, профнастил — вес и цену задайте вручную.</p>' +
      '<div class="bulk row"><label class="lbl" for="bulk-pct">Цены у поставщика изменились?</label>' +
        '<input id="bulk-pct" class="num short" type="number" step="0.5" placeholder="+5"> <span>% ко всем ценам за кг</span>' +
        '<button class="btn" data-action="bulk-price">Применить</button></div>' +
      '<div class="scroll"><table class="data mats"><thead><tr><th>Название</th><th>Тип</th><th>Размеры, мм</th><th class="num">Вес</th><th>Цена</th><th class="num">За единицу</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</section>';
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
          num('laborPerKg', 'Работа сварщика на 1 кг', 'сдельная оплата за изготовление') +
          num('hourRate', 'Ставка часа', 'для доп. часов в изделии') +
          num('installPerKg', 'Монтаж на 1 кг', 'если в заказе отмечен монтаж') +
        '</div></section>' +
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
          num('leadDays', 'Срок изготовления, дней') +
        '</div></section>' +
      '<section class="panel"><h2>Резервная копия</h2>' +
        '<p class="muted">' + (storeMode === 'db' ? 'Данные хранятся в облаке и доступны с любого вашего устройства. Копия пригодится для переноса.' : 'Сейчас данные живут только в этом браузере. Сохраняйте копию раз в неделю.') + '</p>' +
        '<div class="row">' + (caps.downloads ? '<button class="btn" data-action="backup">Скачать копию (JSON)</button>' : '<button class="btn" data-action="backup-copy">Скопировать копию (JSON)</button>') +
        '<label class="btn" for="restore-file">Восстановить из файла<input id="restore-file" type="file" accept="application/json,.json" hidden></label></div>' +
      '</section>' +
    '</div>';
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
      later('mat-' + m.id, function () { Store.put('materials', clone(m)); }, 600);
    } else if (el.id === 'ord-filter') {
      ordFilter = el.value; render();
    } else if (el.id === 'ai-file') {
      aiFile = el.files && el.files[0] || null;
      $('#ai-file-name').textContent = aiFile ? aiFile.name : 'Выбрать фото или эскиз';
    } else if (el.id === 'restore-file') {
      restore(el.files && el.files[0]);
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
      draft.items.push({ id: uid('it'), name: 'Изделие', params: [], values: {}, count: 1, parts: [{ materialId: '', qty: '', note: '' }], laborHours: '' });
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
        parts: clone(it.parts).filter(function (p) { return p.materialId; }), laborHours: it.laborHours || ''
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
      saveDraft(); view = 'calc'; render(); window.scrollTo(0, 0);
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
      var pct = parseFloat(String($('#bulk-pct').value).replace(',', '.'));
      if (!pct) return toast('Введите процент, например 5 или −3', true);
      var n = 0;
      S.materials.forEach(function (m) {
        if (m.priceMode === 'kg') { m.price = Math.round(m.price * (1 + pct / 100)); Store.put('materials', clone(m)); n++; }
      });
      render(); toast('Цены обновлены у ' + n + ' позиций');
    },
    'add-fixed': function () { S.settings.fixedCosts = S.settings.fixedCosts || []; S.settings.fixedCosts.push({ name: '', amount: 0 }); Store.saveSettings(); render(); },
    'del-fixed': function (b) { S.settings.fixedCosts.splice(b.dataset.i, 1); Store.saveSettings(); render(); },
    'backup': function () {
      caps.downloads.save({ filename: 'metal-calc-backup-' + new Date().toISOString().slice(0, 10) + '.json', data: JSON.stringify(S, null, 1) })
        .catch(function () { toast('Скачивание отменено', true); });
    },
    'backup-copy': function () { copyText(JSON.stringify(S)); }
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
