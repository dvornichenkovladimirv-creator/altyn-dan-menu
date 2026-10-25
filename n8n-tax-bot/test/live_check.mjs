// Живая проверка промпта для чеков через OpenAI.
// Запуск: OPENAI_API_KEY=... node test/live_check.mjs фото1.jpg [фото2.jpg ...]
// Запрос идёт через curl, чтобы учитывались настройки прокси (HTTPS_PROXY).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const code = fs.readFileSync(new URL('../src/02_check_request.js', import.meta.url), 'utf8');
const model = process.env.MODEL || 'gpt-5.5';
const bodyFile = path.join(os.tmpdir(), 'tax-bot-body.json');

for (const f of process.argv.slice(2)) {
  const fn = new AsyncFunction('$json', '$input', '$', code);
  const [{ json: { body } }] = await fn.call(
    { helpers: { getBinaryDataBuffer: async () => fs.readFileSync(f) } },
    {},
    { first: () => ({ binary: { data: { mimeType: 'image/jpeg' } } }) },
    () => ({ first: () => ({ json: { model } }) }),
  );
  fs.writeFileSync(bodyFile, JSON.stringify(body));
  const args = ['-sS', '-H', 'content-type: application/json', '--data-binary', `@${bodyFile}`];
  if (process.env.OPENAI_API_KEY) args.push('-H', `authorization: Bearer ${process.env.OPENAI_API_KEY}`);
  args.push('https://api.openai.com/v1/chat/completions');
  const j = JSON.parse(execFileSync('curl', args, { maxBuffer: 1e8 }));
  console.log(path.basename(f), j.choices?.[0]?.message?.content ?? JSON.stringify(j.error));
}
