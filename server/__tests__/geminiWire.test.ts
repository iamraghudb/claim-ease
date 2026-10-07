import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GoogleGenAI } from '@google/genai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGemini } from '../gemini';

// Runs the REAL @google/genai SDK against a throwaway local server, so we can inspect the exact HTTP
// request that would go to Google (URL, API-key header, JSON body) without needing a key or internet.
let server: Server;
let baseUrl = '';
let seen: { url?: string; apiKey?: string | string[]; body?: any } = {};
let reply: { status: number; body: unknown } = { status: 200, body: {} };
/** How long the fake Google sits on a request before answering (per URL), to simulate a hung model. */
let delayMs = (_url: string) => 0;
let requestedUrls: string[] = [];

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

beforeAll(async () => {
  server = createServer(async (req, res) => {
    seen = { url: req.url, apiKey: req.headers['x-goog-api-key'], body: await readBody(req) };
    requestedUrls.push(req.url ?? '');
    await new Promise((resolve) => setTimeout(resolve, delayMs(req.url ?? '')));
    if (res.destroyed) return;
    res.statusCode = reply.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const complete = () => createGemini({ apiKey: 'test-key-123', model: 'gemini-flash-latest', fallbackModels: [] }, new GoogleGenAI({ apiKey: 'test-key-123', httpOptions: { baseUrl } }));
const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };

describe('a hung model (real SDK, real abort)', () => {
  const sdk = () => new GoogleGenAI({ apiKey: 'test-key-123', httpOptions: { baseUrl } });
  const ok = { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] } };
  const args = { system: '', parts: [{ kind: 'text' as const, text: 'x' }], schema, effort: 'low' as const };

  it('abandons the hung model after the timeout and fails over to the next one', async () => {
    reply = ok;
    requestedUrls = [];
    delayMs = (url) => (url.includes('hung-model') ? 2000 : 0);
    const started = Date.now();
    const out = await createGemini({ apiKey: 'k', model: 'hung-model', fallbackModels: ['fast-model'] }, sdk(), { attemptTimeoutMs: 150 })(args);

    expect(out).toEqual({ ok: true });
    expect(requestedUrls.map((u) => u.match(/models\/([^:]+):/)?.[1])).toEqual(['hung-model', 'fast-model']);
    expect(Date.now() - started).toBeLessThan(1500); // did not wait for the 2 s the hung model would have taken
  });

  it('says so in plain words when the only model hangs', async () => {
    reply = ok;
    delayMs = () => 2000;
    await expect(createGemini({ apiKey: 'k', model: 'hung-model', fallbackModels: [] }, sdk(), { lastAttemptTimeoutMs: 150 })(args)).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/took too long/),
    });
    delayMs = () => 0;
  });
});

describe('Gemini over the wire (real SDK, local server)', () => {
  it('sends the model in the URL, the key in a header, and a correct structured-output body', async () => {
    reply = { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] } };
    const out = await complete()({
      system: 'Be careful.',
      parts: [
        { kind: 'text', text: 'Read this' },
        { kind: 'file', mimeType: 'application/pdf', data: 'QUJD' },
      ],
      schema,
      effort: 'medium',
    });

    expect(out).toEqual({ ok: true });
    expect(seen.url).toContain('/models/gemini-flash-latest:generateContent');
    expect(seen.apiKey).toBe('test-key-123');
    expect(seen.body.systemInstruction.parts[0].text).toBe('Be careful.');
    expect(seen.body.contents[0].role).toBe('user');
    expect(seen.body.contents[0].parts).toEqual([{ text: 'Read this' }, { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } }]);
    expect(seen.body.generationConfig.responseMimeType).toBe('application/json');
    expect(seen.body.generationConfig.responseJsonSchema).toEqual(schema);
    expect(seen.body.generationConfig.maxOutputTokens).toBe(16000);
    expect(seen.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'MEDIUM' });
  });

  it('turns a real 429 from the API into the friendly free-tier message', async () => {
    reply = { status: 429, body: { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } } };
    await expect(complete()({ system: '', parts: [{ kind: 'text', text: 'x' }], schema, effort: 'low' })).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/free-tier limit/) });
  });

  it('turns a real "API key not valid" 400 into the key message', async () => {
    reply = { status: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } };
    await expect(complete()({ system: '', parts: [{ kind: 'text', text: 'x' }], schema, effort: 'low' })).rejects.toMatchObject({ message: expect.stringMatching(/rejected the API key/) });
  });
});
