// Шаблоны перил из нержавейки AISI201 (цены IMEX): поручень 51/38/32, стойки 51, 3 сплошных ригеля Ø15,9.
// node tools/build-railing-templates.js — пишет data/template-railing-ss201-*.json
const fs = require('fs'), path = require('path');
const POST = 'imx-494c1bc0'; // труба 50,8×0,9 — стойки
const RAIL = {
  '51': { name: '50,8', pipe: 'imx-494c1bc0', cap: 'imx-e4251dd8', joint: 'imx-05981780' },
  '38': { name: '38,1', pipe: 'imx-c1217b58', cap: 'imx-fea135b2', joint: 'imx-9a291a1f' },
  '32': { name: '31,8', pipe: 'imx-118ddf55', cap: 'imx-278d4f71', joint: 'imx-41ea9cfe' }
};
const JOINTS = '(P+max(ceil(L/6)-1;0))'; // стыки: повороты + стыки хлыстов по 6 м
const POSTS = '(ceil(L/S)+1)';
for (const [k, r] of Object.entries(RAIL)) {
  const t = {
    id: 'tpl-railing-ss201-' + k,
    name: 'Перила нерж. AISI201, поручень ' + k + ', 3 ригеля',
    category: 'Перила нержавейка',
    params: [
      { key: 'L', label: 'Длина ограждения, м', def: 4 },
      { key: 'P', label: 'Поворотов, шт', def: 0 },
      { key: 'H', label: 'Высота, м', def: 0.95 },
      { key: 'S', label: 'Шаг стоек, м', def: 1 }
    ],
    parts: [
      { materialId: r.pipe, n: '1', len: 'L', note: 'поручень Ø' + r.name + ' («' + k + '-я»)' },
      { materialId: POST, n: POSTS, len: 'H-0.06', note: 'стойки Ø50,8: высота минус поручень и чашка' },
      { materialId: 'imx-a98d6e3f', n: '3', len: 'L', note: 'ригели Ø15,9, сплошные, привариваются с лицевой стороны стоек' },
      { materialId: r.cap, qty: '2', note: 'заглушки поручня' },
      { materialId: 'imx-8ee7c798', qty: '6', note: 'заглушки ригелей' },
      { materialId: r.joint, qty: JOINTS, note: 'соединители поручня: повороты + стыки хлыстов' },
      { materialId: 'imx-052f8da3', qty: '3*' + JOINTS, note: 'соединители ригелей: повороты + стыки хлыстов' },
      { materialId: 'imx-288eca88', qty: POSTS, note: 'чашка стойки HIGH d51 сверху' },
      { materialId: 'imx-ae49c2d7', qty: POSTS, note: 'чашка сферы d51 снизу, закрывает фланец' },
      { materialId: 'imx-70098c54', qty: POSTS, note: 'фланец d51 под чашкой (ч/м, скрыт)' },
      { materialId: 'imx-a7e35634', qty: '3*' + POSTS, note: 'анкеры, 3 на фланец' }
    ],
    laborCost: 'L*4000',
    laborHours: ''
  };
  fs.writeFileSync(path.join(__dirname, '../data/template-railing-ss201-' + k + '.json'), JSON.stringify(t, null, 2));
}
