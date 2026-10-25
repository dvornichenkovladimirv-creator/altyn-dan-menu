// Сверяет распознанные чеки с листом «Расходы» и готовит строки для добавления
const { docs } = $('Чеки из ответа').first().json;
const ranges = $json.valueRanges || [];
const rows = ranges[0]?.values || [];
const startRaw = ranges[1]?.values?.[0]?.[0] || '';

const toIso = (s) => {
  const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s);
};
const digits = (s) => String(s || '').replace(/\D/g, '');
const num = (s) => parseFloat(String(s).replace(/[\s ]/g, '').replace(',', '.')) || 0;

const startIso = toIso(startRaw);
const knownFp = new Set(rows.map((r) => digits(r[5])).filter(Boolean));
const knownDateSum = new Set(rows.map((r) => `${toIso(r[0])}|${Math.round(num(r[4]))}`));

const values = [];
const added = [];
const dups = [];
const bad = [];

for (const d of docs) {
  const total = Number(d.total);
  if (!d.readable || !total || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))) {
    bad.push(d);
    continue;
  }
  const fp = digits(d.fp);
  const dateSum = `${d.date}|${Math.round(total)}`;
  if ((fp && knownFp.has(fp)) || (!fp && knownDateSum.has(dateSum))) {
    dups.push(d);
    continue;
  }
  if (fp) knownFp.add(fp);
  knownDateSum.add(dateSum);

  const [y, mo, da] = d.date.split('-');
  values.push([
    `${da}.${mo}.${y}`,
    d.seller || '',
    d.seller_bin ? "'" + digits(d.seller_bin) : '',
    d.items || '',
    total,
    "'" + String(d.fp || ''),
    d.buyer_iin ? 'да' : 'нет',
    'бот',
  ]);
  added.push({ ...d, total, outOfPeriod: Boolean(startIso && d.date < startIso) });
}

return [{ json: { skip: values.length === 0, body: { values }, added, dups, bad } }];
