import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentResponse, type Part as GeminiPart } from '@google/genai';
import type { AiConfig } from './config';
import { HttpError } from './errors';
import type { CompleteArgs, Complete, Effort, Part } from './types';

// How hard the model thinks before answering. Lower is faster. All three features use "low": reading
// printed documents and explaining a status do not need long reasoning, and "low" answers in seconds.
const THINKING: Record<Effort, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM };

/** Google says "try again later" with these. The free tier sees 503 "high demand" often. */
const TRANSIENT = new Set([500, 502, 503, 504]);
/** How long a busy, hung or out-of-quota model is skipped. */
const COOLDOWN_MS = 60_000;

export interface GeminiOptions {
  /** Pauses before the 2nd, 3rd... attempt, on the last model in line. */
  retryDelaysMs?: number[];
  /**
   * Give up on a model that has not answered after this long, when another model is waiting.
   * A busy free-tier model can hold a request for over a minute before saying "503".
   */
  attemptTimeoutMs?: number;
  /** The last model gets longer, because there is nothing left to fall back to. */
  lastAttemptTimeoutMs?: number;
}

const toGeminiPart = (p: Part): GeminiPart => (p.kind === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.data } });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isTimeout = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

/** Google wraps its error JSON inside the exception message; pull the readable sentence out. */
function readableMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return (parsed.error?.message ?? raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

/** Turns anything thrown while talking to Google into a friendly HttpError. */
export function toProviderError(e: unknown, model: string): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof ApiError) {
    if (/API key (not valid|expired)|API_KEY_INVALID/i.test(e.message))
      return new HttpError(502, 'Google rejected the API key. Check GEMINI_API_KEY in .env.local, then restart `npm run dev`.');
    if (e.status === 401 || e.status === 403)
      return new HttpError(502, 'Google refused the request (permission denied). The key may be restricted, or the free tier may not be offered in your country. Create a fresh key at aistudio.google.com/apikey.');
    if (e.status === 404) return new HttpError(502, `Google does not know the model "${model}". Check GEMINI_MODEL in .env.local, or delete that line to use the default.`);
    if (e.status === 429) return new HttpError(429, 'You hit the free-tier limit (requests per minute or per day). Wait a minute and try again.');
    if (e.status >= 500) return new HttpError(502, `Google's AI service is busy (${e.status}: ${readableMessage(e.message)}). Try again in a moment.`);
    return new HttpError(502, `Google could not process the request: ${readableMessage(e.message)}`);
  }
  if (isTimeout(e)) return new HttpError(502, 'The AI took too long to answer (Google is probably busy). Try again in a moment.');
  if (e instanceof TypeError && /fetch/i.test(e.message)) return new HttpError(502, 'Could not reach Google. Check your internet connection and any proxy or VPN.');
  return new HttpError(500, e instanceof Error ? e.message : 'Unexpected server error');
}

/** Checks a finished response and returns the parsed JSON, or throws a friendly error. */
function parseAnswer(response: GenerateContentResponse): unknown {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new HttpError(422, `Google's safety filter blocked this content (${blocked}). Try a different document, or fill the form in by hand.`);

  const candidate = response.candidates?.[0];
  if (!candidate) throw new HttpError(502, 'The AI returned no answer. Try again.');
  if (candidate.finishReason === FinishReason.MAX_TOKENS) throw new HttpError(502, 'The answer was cut off. Try again with fewer or smaller documents.');
  if (candidate.finishReason && candidate.finishReason !== FinishReason.STOP)
    throw new HttpError(422, `Google stopped the answer (${candidate.finishReason}). Try a different document, or fill the form in by hand.`);

  const text = response.text;
  if (!text) throw new HttpError(502, 'The AI returned an empty answer. Try again.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The AI returned an answer the app could not read. Try again.');
  }
}

/**
 * The second argument exists so tests can pass a fake client instead of calling the real API;
 * the third lets tests shorten the waiting.
 *
 * Reliability on the free tier: models are tried in order (main, then the fallbacks). A model that is
 * busy, hung or out of quota is abandoned quickly and skipped for a minute; only the last model in
 * line is retried with a pause.
 */
export function createGemini(
  config: AiConfig,
  client: Pick<GoogleGenAI, 'models'> = new GoogleGenAI({ apiKey: config.apiKey }),
  { retryDelaysMs = [1500, 4000], attemptTimeoutMs = 20_000, lastAttemptTimeoutMs = 60_000 }: GeminiOptions = {},
): Complete {
  const models = [config.model, ...config.fallbackModels.filter((m) => m !== config.model)];

  /** One request to one model, abandoned after `timeoutMs`. */
  const request = async (model: string, { system, parts, schema, effort, maxTokens = 16_000 }: CompleteArgs, timeoutMs: number) => {
    const send = (withThinking: boolean) =>
      client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: parts.map(toGeminiPart) }],
        config: {
          systemInstruction: system,
          // Structured output: the answer is forced to be JSON that matches `schema`.
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          maxOutputTokens: maxTokens,
          abortSignal: AbortSignal.timeout(timeoutMs),
          ...(withThinking && { thinkingConfig: { thinkingLevel: THINKING[effort] } }),
        },
      });
    return send(true).catch((e: unknown) => {
      // A model that does not understand thinking levels answers 400; ask again without one.
      if (e instanceof ApiError && e.status === 400 && /think/i.test(e.message)) return send(false);
      throw e;
    });
  };

  const resting = new Map<string, number>();
  const rest = (model: string) => resting.set(model, Date.now() + COOLDOWN_MS);

  return async (args) => {
    const ready = models.filter((m) => (resting.get(m) ?? 0) <= Date.now());
    const order = ready.length > 0 ? ready : models;

    let lastError: unknown;
    for (const [i, model] of order.entries()) {
      const isLast = i === order.length - 1;
      // When another model is waiting in line, give up on a busy one straight away.
      const attempts = isLast ? retryDelaysMs.length + 1 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const started = Date.now();
        const took = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
        try {
          const response = await request(model, args, isLast ? lastAttemptTimeoutMs : attemptTimeoutMs);
          console.info(`[ai] ${model} answered in ${took()}`);
          return parseAnswer(response);
        } catch (e) {
          lastError = e;
          if (isTimeout(e)) {
            console.warn(`[ai] ${model} did not answer within ${took()}`);
            rest(model);
            break; // do not wait for the same model twice
          }
          if (!(e instanceof ApiError)) throw toProviderError(e, model);
          console.warn(`[ai] ${model} failed with ${e.status} after ${took()}`);
          if (e.status === 429) {
            rest(model); // this model's free quota is used up
            break;
          }
          if (!TRANSIENT.has(e.status)) throw toProviderError(e, model);
          if (attempt < attempts - 1) await sleep(retryDelaysMs[attempt]);
          else rest(model);
        }
      }
    }
    throw toProviderError(lastError, config.model);
  };
}
