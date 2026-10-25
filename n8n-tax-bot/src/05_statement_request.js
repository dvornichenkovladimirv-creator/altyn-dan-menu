// Готовит запрос в OpenAI: PDF-выписка Kaspi -> JSON с поступлениями.
// PDF отправляется файлом целиком: так модель видит колонки «Дебет» и «Кредит» и не путает их.
const item = $input.first();
if (!item.binary || !item.binary.data) throw new Error('Telegram не отдал файл выписки');
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
const cfg = $('Разбор сообщения').first().json;

const prompt = `Это банковская выписка Kaspi Bank по счёту ИП. Верни JSON строго такого вида:
{"period_from":"YYYY-MM-DD","period_to":"YYYY-MM-DD","last_operation":"YYYY-MM-DD","opening_balance":0,"closing_balance":0,"total_debit":0,"total_credit":0,"credit_count":0,"credits":[{"doc":"номер документа","date":"YYYY-MM-DD","sender":"название отправителя без БИН/ИИН","amount":0,"knp":"КНП","purpose":"назначение платежа, кратко, до 80 символов"}]}
Правила:
- last_operation: «Дата последнего движения» из шапки.
- credits: все операции с суммой в колонке «Кредит» (поступления на счёт). Списания не включай.
- total_debit, total_credit и credit_count бери из строк «Итого обороты» и «Итого операций за период» в конце выписки.
- Суммы переписывай точно, без округления, числом.`;

return [{
  json: {
    body: {
      model: cfg.model,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [{
            type: 'file',
            file: { filename: 'statement.pdf', file_data: `data:application/pdf;base64,${buf.toString('base64')}` },
          }],
        },
      ],
    },
  },
}];
