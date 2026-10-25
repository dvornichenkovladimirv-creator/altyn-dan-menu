// Готовит запрос в OpenAI: фото чека -> JSON с реквизитами
const item = $input.first();
if (!item.binary || !item.binary.data) throw new Error('Telegram не отдал файл чека');
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
const cfg = $('Разбор сообщения').first().json;
const mimeType = String(item.binary.data.mimeType || '');
const mime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

const prompt = `Ты бухгалтер ИП в Казахстане. На фото один или несколько фискальных чеков или накладных. Покупатель: ИП «МК», ИИН 870727350990.
Верни JSON строго такого вида:
{"docs":[{"date":"YYYY-MM-DD","seller":"название продавца","seller_bin":"БИН/ИИН продавца, 12 цифр, или пустая строка","items":"кратко что куплено, по-русски, до 80 символов","total":12345.67,"fp":"фискальный признак (ФП/ФБ), а если его нет, номер чека или накладной","buyer_iin":true,"readable":true}]}
Правила:
- total: итоговая сумма документа (ИТОГ / ЖИЫНЫ / БАРЛЫҒЫ / Сумма оплаты). Не сумма внесённых наличных и не сдача.
- buyer_iin: true, только если в документе напечатан ИИН покупателя 870727350990.
- Если документ не читается или не видно суммы и даты, readable=false.
- Ничего не придумывай. Одна запись на один документ.`;

return [{
  json: {
    body: {
      model: cfg.model,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } },
        ],
      }],
    },
  },
}];
