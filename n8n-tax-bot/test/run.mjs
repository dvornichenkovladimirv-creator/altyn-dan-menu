// Прогоняет код узлов на тестовых данных, имитируя окружение n8n (без сети)
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const nodeOut = {};
const fakeNow = { setZone: () => ({ toFormat: () => '25.10.2026' }) };

async function run(file, input, binaryBuf) {
  const items = Array.isArray(input) ? input : [input];
  const $input = { first: () => items[0], all: () => items };
  const $ = (name) => {
    if (!(name in nodeOut)) throw new Error(`узел ${name} не выполнялся`);
    return { first: () => ({ json: nodeOut[name] }) };
  };
  const ctx = { helpers: { getBinaryDataBuffer: async () => binaryBuf } };
  const fn = new AsyncFunction('$json', '$input', '$', '$now', src(file));
  return fn.call(ctx, items[0]?.json, $input, $, fakeNow);
}

// 1. Разбор сообщения
let out = await run('01_parse_message.js', { json: { message: { chat: { id: 555 }, photo: [{ file_id: 's' }, { file_id: 'big' }] } } });
assert.equal(out[0].json.route, 'denied', 'чужой chat id должен блокироваться');
const parseSrc = src('01_parse_message.js').replace('const ALLOWED_CHAT_IDS = [];', "const ALLOWED_CHAT_IDS = ['555'];");
const runParse = async (msg) => {
  const fn = new AsyncFunction('$json', parseSrc);
  return (await fn({ message: msg }))[0].json;
};
assert.equal((await runParse({ chat: { id: 555 }, photo: [{ file_id: 's' }, { file_id: 'big' }] })).fileId, 'big');
assert.equal((await runParse({ chat: { id: 555 }, document: { file_id: 'd', file_name: 'Выписка.PDF', mime_type: 'application/pdf' } })).route, 'pdf');
assert.equal((await runParse({ chat: { id: 555 }, document: { file_id: 'd', file_name: 'v.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } })).route, 'xlsx');
assert.equal((await runParse({ chat: { id: 555 }, document: { file_id: 'd', file_name: 'IMG.jpg', mime_type: 'image/jpeg' } })).route, 'check');
assert.equal((await runParse({ chat: { id: 555 }, text: '/итог' })).route, 'command');
nodeOut['Разбор сообщения'] = await runParse({ chat: { id: 555 }, photo: [{ file_id: 'big' }] });

// 2. Запрос по чеку
out = await run('02_check_request.js', { json: {}, binary: { data: { mimeType: 'image/jpeg' } } }, Buffer.from('img'));
assert.match(out[0].json.body.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,aW1n$/);

// 3. Ответ OpenAI по чеку
out = await run('03_check_parse.js', { json: { choices: [{ message: { content: JSON.stringify({ docs: [
  { date: '2026-10-22', seller: 'ТОО «Gazoil Trade»', seller_bin: '230240001864', items: 'Бензин', total: 13273, fp: '1147961608663', buyer_iin: false, readable: true },
  { date: '2026-10-24', seller: 'ТОО «Траст-Караганда»', seller_bin: '210340029488', items: 'Труба', total: 7200, fp: '999', buyer_iin: true, readable: true },
  { date: '2026-09-30', seller: 'АЗС', seller_bin: '', items: 'Бензин', total: 5000, fp: '777', buyer_iin: false, readable: true },
  { readable: false },
] }) } }] } });
nodeOut['Чеки из ответа'] = out[0].json;
assert.equal(out[0].json.docs.length, 4);

// 4. Новые чеки: первый уже есть в таблице (по ФП)
out = await run('04_check_new.js', { json: { valueRanges: [
  { values: [['22.10.2026', 'ТОО «Gazoil Trade»', '230240001864', 'Бензин АИ-95', '13 273', '1147961608663', 'нет', 'вручную']] },
  { values: [['01.10.2026']] },
] } });
const nc = out[0].json;
assert.equal(nc.dups.length, 1);
assert.equal(nc.added.length, 2);
assert.equal(nc.bad.length, 1);
assert.deepEqual(nc.body.values[0], ['24.10.2026', 'ТОО «Траст-Караганда»', "'210340029488", 'Труба', 7200, "'999", 'да', 'бот']);
assert.equal(nc.added[1].outOfPeriod, true);
nodeOut['Новые чеки'] = nc;

// 8. Сообщение по чеку
const itog = { valueRanges: [{ values: [
  ['Начало периода', '01.10.2026'], ['Ставка ИПН', '10,0%'], ['Ранее начислено по уведомлению, ₸', '146 000'], [], ['Расчёт'],
  ['Доходы за период, ₸', '3 003 530'], ['Расходы по чекам за период, ₸', '699 373'], ['Налогооблагаемая база, ₸', '2 304 157'],
  ['ИПН, ₸', '230 416'], ['Итого к уплате, ₸', '376 416'], [], ['Выписка учтена по', '21.10.2026'], ['Следующая выписка с', '22.10.2026'],
  ['Чеков за период', '29'], ['Чеков без ИИН покупателя', '12'], ['Последний чек от', '24.10.2026'], ['Следующие чеки с', '25.10.2026'],
  [], [], [], ['Порог НДС'], ['Оборот с 1 января до начала периода, ₸'], ['МРП 2026, ₸', '4 325'],
  ['Порог постановки на учёт по НДС, МРП', '10 000'], ['Порог постановки на учёт по НДС, ₸', '43 250 000'],
] }] };
out = await run('08_messages.js', { json: itog });
assert.equal(out.length, 1);
console.log('--- ответ на чек ---\n' + out[0].json.text);
assert.match(out[0].json.text, /376 416 ₸/);
assert.match(out[0].json.text, /Уже в таблице/);

// 5-7. Выписка
nodeOut['Разбор сообщения'] = { ...nodeOut['Разбор сообщения'], route: 'pdf' };
out = await run('05_statement_request.js', { json: {}, binary: { data: { mimeType: 'application/pdf' } } }, Buffer.from('pdf'));
assert.equal(out[0].json.body.messages[1].content[0].file.file_data, 'data:application/pdf;base64,cGRm');

const st = {
  period_from: '2026-10-16', period_to: '2026-10-28', last_operation: '2026-10-27',
  opening_balance: 1000, closing_balance: 1000 + 622930 - 300, total_debit: 300, total_credit: 622930, credit_count: 5,
  credits: [
    { doc: '498', date: '2026-10-21', sender: 'ТОО «InFit»', amount: 84000, knp: '859', purpose: 'двери' },
    { doc: '700', date: '2026-10-25', sender: 'ТОО «Новый клиент»', amount: 500000, knp: '859', purpose: 'ограждения' },
    { doc: '701', date: '2026-10-26', sender: 'Владимир Д.', amount: 20000, knp: '342', purpose: 'Перевод собственных средств' },
    { doc: '702', date: '2026-10-26', sender: 'Kaspi', amount: 17930, knp: '190', purpose: 'Отмена Клевое место' },
    { doc: '1', date: '2026-09-20', sender: 'ТОО «Старый»', amount: 1000, knp: '859', purpose: 'сентябрь' },
  ],
};
out = await run('06_statement_parse.js', { json: { choices: [{ message: { content: JSON.stringify(st) } }] } });
nodeOut['Поступления из ответа'] = out[0].json;
out = await run('07_statement_new.js', { json: { valueRanges: [
  { values: [['21.10.2026', 'ТОО «InFit»', '84 000', 'двери', '498', '498|2026-10-21|84000']] },
  { values: [['01.10.2026']] },
] } });
const ns = out[0].json;
assert.equal(ns.added.length, 1);
assert.equal(ns.added[0].doc, '700');
assert.equal(ns.skipped.length, 2);
assert.equal(ns.check, 'сходится');
assert.deepEqual(ns.logBody.values[0], ['25.10.2026', '16.10.2026', '27.10.2026', 1, 500000, 'сходится']);
nodeOut['Новые поступления'] = ns;
out = await run('08_messages.js', { json: itog });
assert.equal(out.length, 2);
console.log('\n--- ответ на выписку (1) ---\n' + out[0].json.text);
console.log('\n--- ответ на выписку (2) ---\n' + out[1].json.text);

// Сверка не сошлась (модель потеряла поступление): ничего не пишем, предупреждаем
nodeOut['Поступления из ответа'] = { st: { ...st, credits: st.credits.slice(1) }, error: '' };
out = await run('07_statement_new.js', { json: { valueRanges: [{ values: [] }, { values: [['01.10.2026']] }] } });
assert.equal(out[0].json.invalid, true);
assert.equal(out[0].json.problems.length, 2);
nodeOut['Новые поступления'] = out[0].json;
out = await run('08_messages.js', { json: itog });
assert.equal(out.length, 1);
assert.match(out[0].json.text, /Выписку не записал/);
console.log('\n--- выписка не сошлась ---\n' + out[0].json.text);

// Excel-выписка: бот просит PDF
nodeOut['Разбор сообщения'] = { ...nodeOut['Разбор сообщения'], route: 'xlsx', text: '' };
out = await run('08_messages.js', { json: itog });
assert.match(out[0].json.text, /PDF/);

// Пустой ответ OpenAI не роняет сценарий
out = await run('03_check_parse.js', { json: { error: { message: 'rate limit' } } });
assert.equal(out[0].json.error, 'rate limit');
out = await run('06_statement_parse.js', { json: {} });
assert.equal(out[0].json.st.credits.length, 0);

// Напоминание по расписанию
{
  const fn = new AsyncFunction('$json', parseSrc);
  const r = (await fn({ timestamp: '2026-10-26T09:00:00+05:00' }))[0].json;
  assert.equal(r.route, 'reminder');
  assert.equal(r.chatId, '555');
  nodeOut['Разбор сообщения'] = r;
  out = await run('08_messages.js', { json: itog });
  assert.equal(out.length, 1);
  assert.match(out[0].json.text, /Напоминание/);
  assert.match(out[0].json.text, /22\.10\.2026/);
  console.log('\n--- напоминание ---\n' + out[0].json.text);
}

// Порог НДС: пусто -> просьба вписать; 76% -> жёлтое предупреждение и в коротких ответах; 100% -> красное
{
  const withVat = (pct, left) => ({ valueRanges: [{ values: [...itog.valueRanges[0].values,
    ['Оборот с начала года, ₸', 'x'], ['Использовано порога', pct], ['Осталось до порога, ₸', left]] }] });
  nodeOut['Разбор сообщения'] = { ...nodeOut['Разбор сообщения'], route: 'command', text: '/итог' };
  out = await run('08_messages.js', { json: itog });
  assert.match(out[0].json.text, /впишите в таблицу оборот/);
  out = await run('08_messages.js', { json: withVat('76,3%', '10 246 470') });
  assert.match(out[0].json.text, /🟡 Порог НДС: использовано 76,3%, осталось 10 246 470 ₸/);
  nodeOut['Разбор сообщения'] = { ...nodeOut['Разбор сообщения'], route: 'check' };
  out = await run('08_messages.js', { json: withVat('76,3%', '10 246 470') });
  assert.match(out[0].json.text, /🟡/);
  out = await run('08_messages.js', { json: withVat('40,0%', '25 950 000') });
  assert.doesNotMatch(out[0].json.text, /Порог НДС/);
  out = await run('08_messages.js', { json: withVat('101,2%', '0') });
  assert.match(out[0].json.text, /🔴 <b>Порог НДС \(43 250 000 ₸\) превышен/);
  console.log('\n--- порог превышен ---\n' + out[0].json.text);
}

console.log('\nВсе проверки пройдены');
