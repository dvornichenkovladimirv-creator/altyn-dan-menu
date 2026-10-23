// Собирает прайсы поставщиков в документы для коллекции pricelists: node tools/build-pricelists.js <папка>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'data';
const r2 = v => Math.round(v * 100) / 100;

const trast = require('../data/trast-karaganda-2026-10-02.js');
const trastDoc = {
  id: 'trast-karaganda', supplier: trast.supplier, priceDate: trast.priceDate, notes: trast.notes,
  items: trast.items.map(([id, name, kind, dims, stockLen, price, kgList, cutPrice, unit]) => {
    const m = { id, name, kind, dims, price: r2(price), priceMode: 'unit', unit: unit || (kind === 'sheet' ? 'м²' : 'м') };
    if (stockLen) m.stockLen = stockLen;
    if (kind === 'profile' || kind === 'custom') m.kgPerUnit = kgList;
    if (cutPrice) m.cutPrice = cutPrice;
    return m;
  })
};

const imex = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/imex-trade-2026-10-05.json'), 'utf8'));
const imexDoc = {
  id: 'imex-trade', supplier: imex.supplier, priceDate: imex.priceDate, notes: imex.notes,
  items: imex.items.map(it => {
    const name = it.name.replace(/\s*\(шт\.\)/g, '').replace(/\*(6000|4000)/, '').replace(/^Труба нерж /, 'Труба нерж. ')
;
    const m = { id: it.id, name, kind: it.kind, dims: it.dims, price: r2(it.price), priceMode: 'unit', unit: it.unit };
    if (it.stockLen) m.stockLen = it.stockLen;
    if (it.kind === 'custom') m.kgPerUnit = 0;
    return m;
  })
};

for (const d of [trastDoc, imexDoc]) fs.writeFileSync(path.join(out, 'pricelist-' + d.id + '.json'), JSON.stringify(d));
console.log(trastDoc.items.length, imexDoc.items.length);
