// Собирает ответные сообщения в Telegram (HTML-разметка)
const cfg = $('Разбор сообщения').first().json;
const rows = $json.valueRanges?.[0]?.values || $json.values || [];
const get = (label) => (rows.find((r) => r[0] === label) || [])[1] || '—';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => Math.round(Number(n)).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₸';
const ru = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : esc(iso));
const safe = (name) => {
  try {
    return $(name).first().json;
  } catch (e) {
    return null;
  }
};

const tax = get('Итого к уплате, ₸');
const taxLine = `💰 Налог к уплате сейчас: <b>${esc(tax)} ₸</b>`;
const sheetUrl = `https://docs.google.com/spreadsheets/d/${cfg.sheet}/edit`;

const pad = (label, value) => label.padEnd(14, ' ') + String(value).padStart(13, ' ') + ' ₸';
const summary = [
  `<b>📊 Налог ИП «МК» с ${esc(get('Начало периода'))}</b>`,
  '<pre>' + [
    pad('Доходы', get('Доходы за период, ₸')),
    pad('Расходы', get('Расходы по чекам за период, ₸')),
    pad('База', get('Налогооблагаемая база, ₸')),
    pad('ИПН', get('ИПН, ₸')),
    pad('Ранее', '+' + get('Ранее начислено по уведомлению, ₸')),
  ].map(esc).join('\n') + '</pre>',
  `<b>Итого к уплате: ${esc(tax)} ₸</b>`,
  `Чеков за период: ${esc(get('Чеков за период'))}, из них без вашего ИИН: ${esc(get('Чеков без ИИН покупателя'))}`,
  '',
  '<b>📌 Дальше пришлите:</b>',
  `• выписку Kaspi с <b>${esc(get('Следующая выписка с'))}</b>`,
  `• чеки с <b>${esc(get('Следующие чеки с'))}</b>`,
  '',
  `<a href="${sheetUrl}">Открыть таблицу</a>`,
].join('\n');

const messages = [];

if (cfg.route === 'check') {
  const r = safe('Новые чеки') || { added: [], dups: [], bad: [] };
  const parsed = safe('Чеки из ответа') || {};
  const lines = [];
  for (const d of r.added) {
    let line = `✅ ${esc(d.seller)}: ${money(d.total)} (${ru(d.date)})`;
    if (d.outOfPeriod) line += ', дата до начала периода, в налог не входит';
    else if (!d.buyer_iin) line += ', без вашего ИИН';
    lines.push(line);
  }
  for (const d of r.dups) lines.push(`↩️ Уже в таблице: ${esc(d.seller)}, ${money(d.total)} (${ru(d.date)})`);
  if (r.bad.length || (!r.added.length && !r.dups.length)) {
    lines.push('⚠️ Не смог прочитать чек. Переснимите ближе, ровно и при хорошем свете, чтобы были видны дата, итог и ФП.');
  }
  if (parsed.error) lines.push(`Ошибка распознавания: ${esc(parsed.error)}`);
  lines.push('', taxLine);
  messages.push(lines.join('\n'));
} else if (cfg.route === 'pdf' && (safe('Новые поступления') || {}).invalid) {
  const r = safe('Новые поступления');
  messages.push([
    '⚠️ <b>Выписку не записал</b>: сверка с итогами выписки не сошлась.',
    ...r.problems.map((p) => `• ${esc(p)}`),
    ...(r.error ? [`• ${esc(r.error)}`] : []),
    '',
    'Пришлите PDF ещё раз. Если повторится, проверьте, что это полная выписка Kaspi со строкой «Итого обороты».',
    '',
    taxLine,
  ].join('\n'));
} else if (cfg.route === 'pdf') {
  const r = safe('Новые поступления') || { added: [], skipped: [], sum: 0 };
  const lines = [`📄 <b>Выписка принята</b>: ${esc(r.periodFrom)} – ${esc(r.lastOp)}`];
  if (r.added.length) {
    lines.push(`Новых поступлений: ${r.added.length} на ${money(r.sum)}`);
    for (const c of r.added) lines.push(`• ${ru(c.date)} ${esc(c.sender)}: ${money(c.amount)}`);
  } else {
    lines.push('Новых поступлений нет (всё уже было в таблице или вне периода).');
  }
  for (const c of r.skipped) lines.push(`➖ Не доход (${esc(c.why)}): ${ru(c.date)} ${money(c.amount)}`);
  lines.push('✔️ Сверка с «Итого обороты» сошлась.', '', taxLine);
  messages.push(lines.join('\n'));
  messages.push(summary);
} else if (cfg.route === 'reminder') {
  messages.push([
    '⏰ <b>Напоминание: пора внести документы за неделю</b>',
    `• PDF-выписку Kaspi с <b>${esc(get('Следующая выписка с'))}</b>`,
    `• чеки с <b>${esc(get('Следующие чеки с'))}</b>`,
    '',
    taxLine,
  ].join('\n'));
} else {
  const t = cfg.text.toLowerCase();
  if (t.startsWith('/start') || t.startsWith('/help') || t === 'помощь') {
    messages.push([
      '👋 Я считаю налог ИП «МК».',
      '• Пришлите фото чека или накладной, и я внесу расход.',
      '• Пришлите PDF-выписку Kaspi, и я внесу поступления (сверю их с «Итого обороты»).',
      '• Команда /итог покажет текущий расчёт.',
    ].join('\n'));
  } else if (cfg.route === 'xlsx') {
    messages.push('Excel-выписку я не принимаю: в ней нет итоговой строки для сверки. Выгрузите выписку Kaspi в PDF и пришлите сюда.');
  } else if (cfg.route === 'unknown') {
    messages.push('Этот файл я не понимаю. Пришлите фото чека или PDF-выписку Kaspi.');
  }
  messages.push(summary);
}

return messages.map((text) => ({ json: { chatId: cfg.chatId, text } }));
