// Достаёт данные выписки из ответа OpenAI
const content = $json.choices?.[0]?.message?.content || '';
let st = null;
let error = '';
try {
  st = JSON.parse(content);
} catch (e) {
  error = $json.error?.message || 'OpenAI не вернул данные';
}
if (!st || !Array.isArray(st.credits)) {
  st = { credits: [] };
  error = error || 'в выписке не нашлось поступлений';
}
return [{ json: { st, error } }];
