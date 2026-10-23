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
