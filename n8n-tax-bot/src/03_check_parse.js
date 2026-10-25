// Достаёт список документов из ответа OpenAI
const content = $json.choices?.[0]?.message?.content || '';
let docs = [];
let error = '';
try {
  docs = JSON.parse(content).docs || [];
} catch (e) {
  error = $json.error?.message || 'OpenAI не вернул данные';
}
return [{ json: { docs, error } }];
