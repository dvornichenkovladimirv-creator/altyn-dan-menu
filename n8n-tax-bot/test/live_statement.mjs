// Живая проверка промпта для выписки через OpenAI.
// Запуск: OPENAI_API_KEY=... node test/live_statement.mjs выписка.pdf
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const code = fs.readFileSync(new URL('../src/05_statement_request.js', import.meta.url), 'utf8');
const model = process.env.MODEL || 'gpt-5.5';
const fn = new AsyncFunction('$json', '$input', '$', code);
const [{ json: { body } }] = await fn.call(
  { helpers: { getBinaryDataBuffer: async () => fs.readFileSync(process.argv[2]) } },
  {},
  { first: () => ({ binary: { data: { mimeType: 'application/pdf' } } }) },
  () => ({ first: () => ({ json: { model } }) }),
);
const bodyFile = path.join(os.tmpdir(), 'tax-bot-statement.json');
fs.writeFileSync(bodyFile, JSON.stringify(body));
const args = ['-sS', '-m', '300', '-H', 'content-type: application/json', '--data-binary', `@${bodyFile}`];
if (process.env.OPENAI_API_KEY) args.push('-H', `authorization: Bearer ${process.env.OPENAI_API_KEY}`);
args.push('https://api.openai.com/v1/chat/completions');
const j = JSON.parse(execFileSync('curl', args, { maxBuffer: 1e8 }));
const st = JSON.parse(j.choices?.[0]?.message?.content || 'null');
if (!st) {
  console.log(JSON.stringify(j.error));
  process.exit(1);
}
const sum = st.credits.reduce((s, c) => s + c.amount, 0);
for (const c of st.credits) console.log(c.date, c.amount, c.knp, c.doc, c.sender);
console.log(`поступлений ${st.credits.length} на ${sum}; в итоге выписки ${st.credit_count} на ${st.total_credit}`);
