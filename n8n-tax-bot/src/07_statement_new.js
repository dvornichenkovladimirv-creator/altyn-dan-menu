// Отбирает новые поступления за период и готовит строки для листов «Доходы» и «Выписки»
const { st, error } = $('Поступления из ответа').first().json;
const ranges = $json.valueRanges || [];
const rows = ranges[0]?.values || [];
const startRaw = ranges[1]?.values?.[0]?.[0] || '';

const toIso = (s) => {
  const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s);
};
const ru = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : '');
const startIso = toIso(startRaw);
const known = new Set(rows.map((r) => String(r[5] || '').trim()));

const values = [];
const added = [];
const skipped = [];

for (const c of st.credits || []) {
  const amount = Number(c.amount);
  if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || ''))) continue;
  if (startIso && c.date < startIso) continue; // до начала периода, уже посчитано ранее
  const purpose = String(c.purpose || '');
  const p = purpose.toLowerCase();
  if (String(c.knp) === '342' || p.includes('собственных средств')) {
    skipped.push({ ...c, amount, why: 'перевод своих денег' });
    continue;
  }
  if (p.includes('отмена') || p.includes('возврат')) {
    skipped.push({ ...c, amount, why: 'возврат покупки' });
    continue;
  }
  const key = `${String(c.doc || '').trim()}|${c.date}|${amount}`;
  if (known.has(key)) continue; // уже есть в таблице
  known.add(key);
  values.push([ru(c.date), c.sender || '', amount, purpose, "'" + String(c.doc || ''), "'" + key]);
  added.push({ ...c, amount });
}

// Сверка: все поступления из выписки должны совпасть с итоговой строкой «Итого обороты»
const sum = added.reduce((s, c) => s + c.amount, 0);
const round2 = (x) => Math.round(Number(x) * 100) / 100;
const credits = st.credits || [];
const allCredits = round2(credits.reduce((s, c) => s + Number(c.amount || 0), 0));
const problems = [];
if (typeof st.total_credit !== 'number' || allCredits !== round2(st.total_credit)) {
  problems.push(`сумма поступлений ${allCredits} не равна итогу по кредиту ${st.total_credit}`);
}
if (typeof st.credit_count === 'number' && credits.length !== st.credit_count) {
  problems.push(`найдено ${credits.length} поступлений, а в итоге выписки ${st.credit_count}`);
}
if ([st.opening_balance, st.closing_balance, st.total_debit, st.total_credit].every((x) => typeof x === 'number')
  && round2(st.opening_balance + st.total_credit - st.total_debit) !== round2(st.closing_balance)) {
  problems.push('остатки не сходятся');
}
const invalid = Boolean(error) || problems.length > 0;
const check = invalid ? 'НЕ сходится' : 'сходится';
const today = $now.setZone('Asia/Almaty').toFormat('dd.MM.yyyy');
const lastOp = st.last_operation || st.period_to || '';

return [{
  json: {
    invalid,
    problems,
    skip: values.length === 0,
    body: { values },
    logBody: { values: [[today, ru(st.period_from), ru(lastOp), added.length, sum, check]] },
    added,
    skipped,
    sum,
    check,
    periodFrom: ru(st.period_from),
    lastOp: ru(lastOp),
    error,
  },
}];
