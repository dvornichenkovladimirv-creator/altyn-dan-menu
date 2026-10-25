// ===== НАСТРОЙКИ =====
// ID Google-таблицы «Налоги ИП МК» (из ссылки на таблицу)
const SHEET_ID = '1epYsyQoB1FgexKBqlWgGdriKxeO86hXDe0_VYL9EzdY';
// Кому бот отвечает. Узнать свой chat id: напишите боту что угодно, он пришлёт номер.
const ALLOWED_CHAT_IDS = [];
// Модель OpenAI с распознаванием изображений
const MODEL = 'gpt-5.5';
// =====================

const m = $json.message || {};
const chatId = String(m.chat?.id ?? '');
let route = 'command';
let fileId = null;
let fileName = '';

if (m.photo && m.photo.length) {
  route = 'check';
  fileId = m.photo[m.photo.length - 1].file_id; // самое большое разрешение
} else if (m.document) {
  const mime = String(m.document.mime_type || '').toLowerCase();
  fileName = m.document.file_name || '';
  const name = fileName.toLowerCase();
  fileId = m.document.file_id;
  if (mime.startsWith('image/')) route = 'check';
  else if (mime === 'application/pdf' || name.endsWith('.pdf')) route = 'pdf';
  else if (name.endsWith('.xlsx') || name.endsWith('.xls') || mime.includes('spreadsheet') || mime.includes('excel')) route = 'xlsx';
  else route = 'unknown';
}

if (!ALLOWED_CHAT_IDS.includes(chatId)) route = 'denied';

return [{
  json: {
    chatId,
    route,
    fileId,
    fileName,
    text: String(m.text || m.caption || '').trim(),
    sheet: SHEET_ID,
    model: MODEL,
  },
}];
