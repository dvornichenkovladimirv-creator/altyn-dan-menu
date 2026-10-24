const test = require('node:test');
const assert = require('node:assert');
const C = require('../calc.js');

const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('вес профтрубы совпадает с ГОСТ 30245', () => {
  near(C.kgPerUnit({ kind: 'rect', dims: { a: 40, b: 20, t: 2 } }), 1.68);
  near(C.kgPerUnit({ kind: 'square', dims: { a: 60, t: 3 } }), 5.19, 0.05);
  near(C.kgPerUnit({ kind: 'rect', dims: { a: 60, b: 40, t: 2 } }), 2.93, 0.03);
});

test('круглая труба, лист, арматура', () => {
  near(C.kgPerUnit({ kind: 'round', dims: { d: 57, t: 3 } }), 3.99);
  assert.strictEqual(C.kgPerUnit({ kind: 'sheet', dims: { t: 2 } }), 15.7);
  near(C.kgPerUnit({ kind: 'rod', dims: { d: 12 } }), 0.888, 0.002);
});

test('формулы: параметры, функции, запятая', () => {
  assert.strictEqual(C.evalFormula('2*W+2*H', { W: 3, H: 2 }), 10);
  assert.strictEqual(C.evalFormula('ceil(L/0,8)+1', { L: 6 }), 9);
  assert.strictEqual(C.evalFormula('max(H;2)*2', { H: 1.5 }), 4);
  assert.strictEqual(C.evalFormula('3×2'), 6);
  assert.strictEqual(C.evalFormula(''), 0);
  assert.throws(() => C.evalFormula('W+', { W: 1 }));
  assert.throws(() => C.evalFormula('Z*2', {}), /Неизвестный параметр/);
});

test('расчёт позиции и заказа', () => {
  const mats = C.DEFAULT_MATERIALS;
  const tpl = C.DEFAULT_TEMPLATES[0];
  const item = { ...tpl, values: { W: 4, H: 2 }, count: 1 };
  const r = C.calcItem(item, mats);
  assert.strictEqual(r.errors, 0);
  assert.ok(r.kg > 50 && r.kg < 200, 'вес ворот правдоподобный: ' + r.kg);

  const s = C.DEFAULT_SETTINGS;
  const o = C.calcOrder({ items: [item], options: { paint: true, install: true, trips: 2, distanceKm: 20 } }, mats, s);
  assert.ok(o.price > o.cost);
  assert.strictEqual(o.price % s.roundTo, 0);
  const fuel = o.rows.find(x => x.key === 'fuel').value;
  near(fuel, 2 * 20 * 2 / 100 * 14 * 240, 0.001);
  near(o.cost, o.rows.reduce((a, x) => a + x.value, 0), 0.001);
});

test('накладные на кг из постоянных расходов', () => {
  near(C.overheadPerKg({ fixedCosts: [{ amount: 300000 }, { amount: 60000 }], monthlyKg: 6000 }), 60);
  assert.strictEqual(C.overheadPerKg({ fixedCosts: [], monthlyKg: 0 }), 0);
});

test('деталь шт × длина', () => {
  const r = C.partQty({ n: '4', len: 'H' }, { H: 2 });
  assert.deepStrictEqual([r.value, r.n, r.len], [8, 4, 2]);
  assert.strictEqual(C.partQty({ qty: '2*W' }, { W: 3 }).value, 6);
});

test('карта реза: укладка по хлыстам с учётом реза', () => {
  const p = C.cutPlan([{ len: 2.9, label: 'a' }, { len: 2.9, label: 'a' }, { len: 3.1, label: 'b' }, { len: 2.5, label: 'c' }], 6, 3);
  assert.strictEqual(p.bars.length, 2);
  p.bars.forEach(b => {
    const used = b.cuts.reduce((a, c) => a + c.len, 0) + (b.cuts.length - 1) * 0.003;
    assert.ok(used <= 6 + 1e-9, 'не больше хлыста');
  });
  // 2,9 + 2,9 + рез > 5,8 — помещаются в один хлыст 6 м
  assert.ok(p.bars.some(b => b.cuts.length === 2 && b.cuts.every(c => c.len === 2.9)));
});

test('карта реза: деталь длиннее хлыста стыкуется', () => {
  const p = C.cutPlan([{ len: 7.5, label: 'прогон' }], 6, 3);
  assert.strictEqual(p.joints, 1);
  assert.strictEqual(p.bars.length, 2);
});

test('цена по позициям в сумме равна итогу', () => {
  const s = C.DEFAULT_SETTINGS, mats = C.DEFAULT_MATERIALS;
  const order = { items: C.DEFAULT_TEMPLATES.map(t => ({ ...t, values: {}, count: 1 })), options: { paint: true } };
  const R = C.calcOrder(order, mats, s);
  const parts = C.allocatePrice(R, order, s);
  assert.strictEqual(parts.reduce((a, b) => a + b, 0), R.price);
  assert.ok(parts.every(x => x > 0));
});

test('план против факта и коэффициенты по факту', () => {
  const R = { price: 300000, rows: [{ key: 'metal', value: 100000 }, { key: 'waste', value: 7000 }, { key: 'fuel', value: 2000 }, { key: 'overhead', value: 9000 }] };
  const tx = [
    { orderId: 'o1', category: 'metal', amount: 120000 },
    { orderId: 'o1', category: 'client', amount: 210000 },
    { orderId: 'o1', category: 'personal', amount: 5000 },
    { orderId: 'o2', category: 'metal', amount: 999 }
  ];
  const pf = C.planVsFact(R, tx, 'o1');
  assert.strictEqual(pf.rows.find(r => r.id === 'metal').plan, 107000);
  assert.strictEqual(pf.factDirect, 120000);
  assert.strictEqual(pf.debt, 90000);

  const today = new Date(2026, 9, 20);
  const sug = C.suggestCoefficients([
    { date: '2026-10-05', category: 'consumables', amount: 60000 },
    { date: '2026-09-05', category: 'rent', amount: 300000 },
    { date: '2026-01-01', category: 'rent', amount: 999999 }
  ], [{ status: 'сдан', createdAt: '2026-10-01', totals: { kg: 1500 } }], C.DEFAULT_SETTINGS, 3, today);
  assert.strictEqual(sug.rows.find(r => r.key === 'consumablesPerKg').fact, 40);
  assert.strictEqual(sug.fixedCosts[0].amount, 100000);
});

test('шаблоны по умолчанию считаются без ошибок', () => {
  C.DEFAULT_TEMPLATES.forEach(t => {
    const r = C.calcItem({ ...t, values: {}, count: 1 }, C.DEFAULT_MATERIALS);
    assert.strictEqual(r.errors, 0, t.name);
  });
});

test('налог за октябрь совпадает с расчётом из чата (389 290)', () => {
  const s = { ...C.DEFAULT_SETTINGS, taxFrom: '2026-10-01', taxRate: 10,
    taxAdjustments: [{ month: '2026-10', amount: 146000, note: 'по уведомлению' }] };
  const tx = [
    { date: '2026-10-02', category: 'client', amount: 3003530 },
    { date: '2026-10-05', category: 'metal', amount: 570630, doc: true },
    { date: '2026-10-06', category: 'fuel', amount: 50000, doc: false },
    { date: '2026-09-23', category: 'client', amount: 506200 },
    { date: '2026-09-17', category: 'fuel', amount: 12601, doc: true },
    { date: '2026-10-07', category: 'personal', amount: 64079 }
  ];
  const [oct, ...rest] = C.taxByMonth(tx, s);
  assert.strictEqual(rest.length, 0, 'сентябрь до начала учёта не считается');
  assert.strictEqual(oct.base, 2432900);
  assert.strictEqual(oct.tax, 243290);
  assert.strictEqual(oct.total, 389290);
  assert.strictEqual(oct.savingIfDocs, 5000);
  assert.strictEqual(C.yearIncome(tx, 2026), 3509730);
});

test('металл по целым хлыстам: платим за хлыст, отход не начисляем', () => {
  const mats = [{ id: 'p', name: 'Профтруба 40×20×2', kind: 'rect', dims: { a: 40, b: 20, t: 2 }, price: 765, priceMode: 'unit', unit: 'м' }];
  const order = { items: [{ name: 'Стойка', params: [], values: {}, count: 1, parts: [{ materialId: 'p', n: '2', len: '2' }] }], options: {} };
  const on = C.calcOrder(order, mats, { ...C.DEFAULT_SETTINGS, wholeBars: true, wastePct: 7 });
  assert.strictEqual(on.rows.find(r => r.key === 'metal').value, 6 * 765);
  assert.strictEqual(on.rows.find(r => r.key === 'waste'), undefined);
  const off = C.calcOrder(order, mats, { ...C.DEFAULT_SETTINGS, wholeBars: false, wastePct: 7 });
  assert.strictEqual(off.rows.find(r => r.key === 'metal').value, 4 * 765);
  assert.ok(Math.abs(off.rows.find(r => r.key === 'waste').value - 4 * 765 * 0.07) < 1e-6);
});

test('швеллер: вес вручную, режется по карте реза', () => {
  const m = { id: 's', name: 'Швеллер 10У', kind: 'profile', kgPerUnit: 9.17, price: 3749, priceMode: 'unit', unit: 'м', stockLen: 6 };
  assert.strictEqual(C.materialKg(m), 9.17);
  const plans = C.orderCutPlans({ items: [{ name: 'Рама', count: 1, parts: [{ materialId: 's', n: '3', len: '2.5' }] }] }, [m], C.DEFAULT_SETTINGS);
  assert.strictEqual(plans[0].bars.length, 2);
});

test('перила нерж.: ставка сварщика за метр, сплошные ригели, соединители на повороты', () => {
  const mats = require('../data/pricelist-imex-trade.json').items;
  const t = require('../data/template-railing-ss201-51.json');
  const it = { ...t, values: { L: 8, P: 3 }, count: 1 };
  const r = C.calcItem(it, mats);
  assert.strictEqual(r.errors, 0);
  assert.strictEqual(r.work, 8 * 4000);
  const q = re => r.lines.find(l => re.test(l.part.note)).qty;
  assert.strictEqual(q(/соединители поручня/), 3 + 1, '3 поворота + 1 стык хлыстов на 8 м');
  assert.strictEqual(q(/соединители ригелей/), 12);
  assert.strictEqual(q(/заглушки ригелей/), 6);
  const rig = r.lines.find(l => /ригели/.test(l.part.note));
  assert.deepStrictEqual([rig.n, rig.len], [3, 8]);
  const o = C.calcOrder({ items: [it], options: { install: true } }, mats, C.DEFAULT_SETTINGS);
  assert.strictEqual(o.rows.find(x => x.key === 'labor').value, 32000);
  for (const k of ['38', '51-32']) assert.strictEqual(C.calcItem({ ...require('../data/template-railing-ss201-' + k + '.json'), values: {}, count: 1 }, mats).errors, 0, k);
  const t38 = require('../data/template-railing-ss201-38.json');
  assert.ok(t38.parts.every(p => !/d51|50,8/.test(mats.find(m => m.id === p.materialId).name)), 'в шаблоне 38 нет деталей на 51');
});
