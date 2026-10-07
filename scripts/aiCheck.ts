// `npm run ai:check`: proves your Gemini API key works, then reads the sample documents with the real model.
// Free-tier friendly: three small requests. Run it once after you add your key to .env.local.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { resolveConfig } from '../server/config';
import { toHttpError } from '../server/errors';
import { createGemini } from '../server/gemini';
import { createHandlers } from '../server/handlers';

const config = resolveConfig(loadEnv('development', process.cwd(), ''));

if (!config.apiKey) {
  console.error(
    'No GEMINI_API_KEY found.\n' +
      '  1. open https://aistudio.google.com/apikey and click "Create API key" (free, no card)\n' +
      '  2. paste it after GEMINI_API_KEY= in .env.local\n' +
      '  3. run `npm run ai:check` again',
  );
  process.exit(1);
}

const complete = createGemini(config);
const handlers = createHandlers({ complete, model: config.model });
const sample = (name: string) => readFileSync(resolve('public/samples', name)).toString('base64');

async function step<T>(title: string, run: () => Promise<T>): Promise<T> {
  process.stdout.write(`${title} ... `);
  const started = Date.now();
  try {
    const out = await run();
    console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return out;
  } catch (e) {
    console.log('FAILED');
    console.error(`\n  ${toHttpError(e).message}\n`);
    process.exit(1);
  }
}

console.log(`Model: ${config.model}\n`);

await step('1/3 Connecting to Gemini', () =>
  complete({
    system: 'Answer the question.',
    parts: [{ kind: 'text', text: 'Is the sky blue? Answer true or false.' }],
    schema: { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'boolean' } } },
    effort: 'low',
    maxTokens: 4000,
  }),
);

const bill = await step('2/3 Reading the sample itemized bill (PDF, health)', () =>
  handlers.scan({ claimType: 'HEALTH', documents: [{ fileName: 'sample-itemized-bill.pdf', mimeType: 'application/pdf', data: sample('sample-itemized-bill.pdf') }] }),
);
console.log(`\n  Document: ${bill.documents[0]?.documentType} - ${bill.documents[0]?.summary}`);
for (const f of bill.fields) console.log(`  ${f.key.padEnd(14)} ${f.value.padEnd(32)} [${f.confidence}]`);
for (const l of bill.serviceLines) console.log(`  line           ${l.procedureCode} / ${l.diagnosisCode} x${l.units}  $${l.billedAmount}  [${l.confidence}]`);
for (const w of bill.warnings) console.log(`  warning: ${w}`);

const estimate = await step('\n3/3 Reading the sample repair estimate (PNG, auto)', () =>
  handlers.scan({ claimType: 'AUTO', documents: [{ fileName: 'sample-repair-estimate.png', mimeType: 'image/png', data: sample('sample-repair-estimate.png') }] }),
);
console.log(`\n  Document: ${estimate.documents[0]?.documentType} - ${estimate.documents[0]?.summary}`);
for (const f of estimate.fields) console.log(`  ${f.key.padEnd(14)} ${f.value.padEnd(32)} [${f.confidence}]`);
for (const w of estimate.warnings) console.log(`  warning: ${w}`);

console.log('\nAll good. Start the app with `npm run dev`; the AI features now use Gemini.');
