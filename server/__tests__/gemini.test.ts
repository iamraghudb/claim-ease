import { ApiError, FinishReason, ThinkingLevel } from '@google/genai';
import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors';
import { createGemini, toProviderError } from '../gemini';
import type { CompleteArgs } from '../types';

const config = { apiKey: 'test-key', model: 'gemini-flash-latest', fallbackModels: [] as string[] };
const schema = { type: 'object', additionalProperties: false, required: [], properties: {} };
const args = (over: Partial<CompleteArgs> = {}): CompleteArgs => ({ system: 'SYS', parts: [{ kind: 'text', text: 'hi' }], schema, effort: 'low', ...over });

/** A fake Google client whose generateContent returns / throws what the test queues up. */
function fakeClient(...results: unknown[]) {
  const generateContent = vi.fn();
  for (const r of results) {
    if (r instanceof Error) generateContent.mockRejectedValueOnce(r);
    else generateContent.mockResolvedValueOnce(r);
  }
  return { generateContent, client: { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'> };
}

const answer = (text: string, finishReason: FinishReason = FinishReason.STOP) => ({ text, candidates: [{ finishReason }] });
const apiError = (status: number, message = 'boom') => new ApiError({ status, message });

describe('createGemini', () => {
  it('sends the request shape the API expects (model, files inline, structured output, thinking level)', async () => {
    const { generateContent, client } = fakeClient(answer('{"ok":true}'));
    const out = await createGemini(config, client)(
      args({ effort: 'medium', parts: [{ kind: 'text', text: 'Document 1: a.pdf' }, { kind: 'file', mimeType: 'application/pdf', data: 'QUJD' }] }),
    );

    expect(out).toEqual({ ok: true });
    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe('gemini-flash-latest');
    expect(req.contents).toEqual([{ role: 'user', parts: [{ text: 'Document 1: a.pdf' }, { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } }] }]);
    expect(req.config).toMatchObject({
      systemInstruction: 'SYS',
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    });
  });

  it('uses the model from config', async () => {
    const { generateContent, client } = fakeClient(answer('{}'));
    await createGemini({ ...config, model: 'gemini-3.8-flash' }, client)(args());
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.8-flash');
  });

  it('retries once without a thinking level when the model rejects it', async () => {
    const { generateContent, client } = fakeClient(apiError(400, 'Unable to submit request because thinking level is not supported'), answer('{"ok":1}'));
    await expect(createGemini(config, client)(args())).resolves.toEqual({ ok: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].config).toHaveProperty('thinkingConfig');
    expect(generateContent.mock.calls[1][0].config).not.toHaveProperty('thinkingConfig');
  });

  it('does not retry other 400s', async () => {
    const { generateContent, client } = fakeClient(apiError(400, 'Something else is wrong'));
    await expect(createGemini(config, client)(args())).rejects.toBeInstanceOf(HttpError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('turns a safety block into a friendly 422', async () => {
    const blockedPrompt = { text: undefined, promptFeedback: { blockReason: 'SAFETY' }, candidates: [] };
    const blockedAnswer = answer('', FinishReason.SAFETY);
    for (const r of [blockedPrompt, blockedAnswer]) {
      const { client } = fakeClient(r);
      await expect(createGemini(config, client)(args())).rejects.toMatchObject({ status: 422 });
    }
  });

  it('turns a truncated answer into a 502 instead of returning half a JSON document', async () => {
    const { client } = fakeClient(answer('{"ok":', FinishReason.MAX_TOKENS));
    await expect(createGemini(config, client)(args())).rejects.toMatchObject({ status: 502 });
  });

  it('rejects an empty, missing or unparseable answer', async () => {
    for (const r of [{ text: '', candidates: [{ finishReason: FinishReason.STOP }] }, { text: undefined, candidates: [] }, answer('not json')]) {
      const { client } = fakeClient(r);
      await expect(createGemini(config, client)(args())).rejects.toMatchObject({ status: 502 });
    }
  });

  it('maps API failures to friendly errors', async () => {
    const { client } = fakeClient(apiError(429, 'quota'));
    await expect(createGemini(config, client)(args())).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/free-tier limit/) });
  });
});

describe('overload handling (fail over fast, retry only the last model, remember busy models)', () => {
  const withFallback = { ...config, fallbackModels: ['gemini-flash-lite-latest'] };
  const busy = () => apiError(503, '{"error":{"message":"This model is currently experiencing high demand."}}');
  const calledModels = (g: ReturnType<typeof vi.fn>) => g.mock.calls.map((c) => c[0].model);

  it('with no other model to try, retries the same model after a temporary 503', async () => {
    const { generateContent, client } = fakeClient(busy(), answer('{"ok":1}'));
    await expect(createGemini(config, client, { retryDelaysMs: [0, 0] })(args())).resolves.toEqual({ ok: 1 });
    expect(calledModels(generateContent)).toEqual(['gemini-flash-latest', 'gemini-flash-latest']);
  });

  it('moves to the fallback model immediately when the main one is busy (no waiting around)', async () => {
    const { generateContent, client } = fakeClient(busy(), answer('{"ok":2}'));
    await expect(createGemini(withFallback, client, { retryDelaysMs: [0, 0] })(args())).resolves.toEqual({ ok: 2 });
    expect(calledModels(generateContent)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  it('goes straight to the fallback when the main model is out of free quota (429)', async () => {
    const { generateContent, client } = fakeClient(apiError(429, 'quota'), answer('{"ok":3}'));
    await expect(createGemini(withFallback, client, { retryDelaysMs: [0, 0] })(args())).resolves.toEqual({ ok: 3 });
    expect(calledModels(generateContent)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  it('skips a model that just failed, so the next request does not pay for a failed attempt', async () => {
    const { generateContent, client } = fakeClient(busy(), answer('{"n":1}'), answer('{"n":2}'));
    const complete = createGemini(withFallback, client, { retryDelaysMs: [0, 0] });
    await complete(args());
    await complete(args());
    expect(calledModels(generateContent)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-flash-lite-latest']);
  });

  it('retries the last model with backoff, then gives a clear error when everything is busy', async () => {
    const { generateContent, client } = fakeClient(...Array.from({ length: 4 }, busy));
    await expect(createGemini(withFallback, client, { retryDelaysMs: [0, 0] })(args())).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/busy.*high demand/) });
    expect(calledModels(generateContent)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-flash-lite-latest']);
  });

  it('does not retry or fall back on errors that retrying cannot fix (bad key, bad request)', async () => {
    const { generateContent, client } = fakeClient(apiError(403, 'denied'));
    await expect(createGemini(withFallback, client, { retryDelaysMs: [0, 0] })(args())).rejects.toMatchObject({ status: 502 });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('ignores a fallback that is the same model as the main one', async () => {
    const { generateContent, client } = fakeClient(apiError(429, 'quota'));
    await expect(createGemini({ ...config, fallbackModels: ['gemini-flash-latest'] }, client, { retryDelaysMs: [0] })(args())).rejects.toMatchObject({ status: 429 });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('toProviderError', () => {
  const m = (e: unknown) => toProviderError(e, 'gemini-x');

  it('explains a bad key (Google answers 400 for it)', () => {
    expect(m(apiError(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}')).message).toMatch(/rejected the API key/);
  });
  it('explains permission problems, including the regional free-tier case', () => {
    expect(m(apiError(403)).message).toMatch(/permission denied/);
    expect(m(apiError(401)).message).toMatch(/free tier may not be offered/);
  });
  it('names the model on a 404', () => {
    expect(m(apiError(404)).message).toContain('gemini-x');
  });
  it('maps rate limits to 429 and server trouble to 502', () => {
    expect(m(apiError(429)).status).toBe(429);
    expect(m(apiError(503)).status).toBe(502);
  });
  it("pulls the readable sentence out of Google's JSON error body", () => {
    expect(m(apiError(400, '{"error":{"code":400,"message":"Request payload size exceeds the limit"}}')).message).toContain('Request payload size exceeds the limit');
  });
  it('recognises network failures', () => {
    expect(m(new TypeError('fetch failed')).message).toMatch(/Could not reach Google/);
  });
  it('passes HttpErrors through untouched', () => {
    const e = new HttpError(418, 'teapot');
    expect(m(e)).toBe(e);
  });
});
