// Шаблоны перил из нержавейки AISI201 (цены IMEX), 3 сплошных ригеля Ø15,9 с лицевой стороны стоек.
//   38 — стойка и поручень «38-я» (38,1), чашки и фланец 38;
//   51 — стойка и поручень «51-я» (50,8), чашки и фланец 51;
//   51-32 — как 51 плюс второй поручень «32-я» (31,8) — ограждение для маломобильных.
// Фланцы — чёрный металл (скрыты чашкой). Анкер — своя цена (материал anchor-m8).
// node tools/build-railing-templates.js — пишет data/template-railing-ss201-*.json
const fs = require('fs'), path = require('path');
const D = {
  '51': { size: '50,8', pipe: 'imx-494c1bc0', cap: 'imx-e4251dd8', joint: 'imx-05981780',
    cupTop: 'imx-288eca88', cupBottom: 'imx-ae49c2d7', flange: 'imx-70098c54', flangeNote: 'фланец d51 под чашкой (ч/м, скрыт)', postCut: 0.06 },
  '38': { size: '38,1', pipe: 'imx-c1217b58', cap: 'imx-fea135b2', joint: 'imx-9a291a1f',
    cupTop: 'imx-063abb9a', cupBottom: 'imx-34c1d8ba', flange: 'imx-9403ab0c', flangeNote: 'фланец d38 под чашкой (ч/м, скрыт)', postCut: 0.05 },
  '32': { size: '31,8', pipe: 'imx-118ddf55', cap: 'imx-278d4f71', joint: 'imx-41ea9cfe' }
};
const JOINTS = '(P+max(ceil(L/6)-1;0))'; // стыки: повороты + стыки хлыстов по 6 м
const POSTS = '(ceil(L/S)+1)';

function railing(post, extra) {
  const p = D[post], parts = [
    { materialId: p.pipe, n: '1', len: 'L', note: 'поручень «' + post + '-я» (Ø' + p.size + ')' },
    { materialId: p.pipe, n: POSTS, len: 'H-' + p.postCut, note: 'стойки «' + post + '-я»: высота минус поручень и чашка' },
    { materialId: 'imx-a98d6e3f', n: '3', len: 'L', note: 'ригели Ø15,9, сплошные, с лицевой стороны стоек' },
    { materialId: p.cap, qty: '2', note: 'заглушки поручня' },
    { materialId: 'imx-8ee7c798', qty: '6', note: 'заглушки ригелей' },
    { materialId: p.joint, qty: JOINTS, note: 'соединители поручня: повороты + стыки хлыстов' },
    { materialId: 'imx-052f8da3', qty: '3*' + JOINTS, note: 'соединители ригелей: повороты + стыки хлыстов' },
    { materialId: p.cupTop, qty: POSTS, note: 'чашка стойки HIGH ' + post + ' сверху' },
    { materialId: p.cupBottom, qty: POSTS, note: 'чашка сферы ' + post + ' снизу, закрывает фланец' },
    { materialId: p.flange, qty: POSTS, note: p.flangeNote },
    { materialId: 'anchor-m8', qty: '3*' + POSTS, note: 'анкеры, 3 на фланец' }
  ];
  if (extra) {
    const e = D[extra];
    parts.splice(3, 0,
      { materialId: e.pipe, n: '1', len: 'L', note: 'второй поручень «' + extra + '-я» для маломобильных, приваривается к стойкам напрямую' },
      { materialId: e.cap, qty: '2', note: 'заглушки второго поручня' },
      { materialId: e.joint, qty: JOINTS, note: 'соединители второго поручня' });
  }
  const key = post + (extra ? '-' + extra : '');
  return {
    id: 'tpl-railing-ss201-' + key,
    name: 'Перила нерж. AISI201: стойка и поручень ' + post + (extra ? ' + поручень ' + extra + ' (для инвалидов)' : '') + ', 3 ригеля 16',
    category: 'Перила нержавейка',
    params: [
      { key: 'L', label: 'Длина ограждения, м', def: 4 },
      { key: 'P', label: 'Поворотов, шт', def: 0 },
      { key: 'H', label: 'Высота, м', def: 0.95 },
      { key: 'S', label: 'Шаг стоек, м', def: 1 }
    ],
    parts, laborCost: 'L*4000', laborHours: '', file: key
  };
}

for (const t of [railing('38'), railing('51'), railing('51', '32')]) {
  const file = t.file; delete t.file;
  fs.writeFileSync(path.join(__dirname, '../data/template-railing-ss201-' + file + '.json'), JSON.stringify(t, null, 2));
}
