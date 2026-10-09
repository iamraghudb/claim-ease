// The AI endpoints as a Vercel serverless function. It is bundled into api/ai/[...path].js by `npm run build:api`
// (see scripts/buildApi.mjs), so Vercel runs one plain file. The API key comes from the GEMINI_API_KEY environment
// variable set in the Vercel dashboard. It is read here, in Node, and never reaches the browser.
//
// Because the link is public, three protections sit in front of the handlers:
//  1. a per-visitor rate limit, so one person cannot drain the free quota;
//  2. a same-origin check, so other websites cannot use this deployment;
//  3. a labelled "Demo data" fallback when Google is busy or the quota is used up, so a demo never just breaks.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveConfig } from './config';
import { HttpError, toHttpError } from './errors';
import { createGemini } from './gemini';
import { createHandlers, type AiHandlers } from './handlers';
import { JSON_ONLY_MESSAGE, runAiRoute } from './http';
import { createRateLimiter } from './rateLimit';

type VercelRequest = IncomingMessage & { body?: unknown };

const LIMIT_PER_WINDOW = 90;
const WINDOW_MS = 10 * 60 * 1000;
/** Provider trouble that a visitor cannot fix: answer with clearly labelled demo data instead of an error. */
const FALLBACK_STATUSES = new Set([429, 500, 502, 503, 504]);

const config = resolveConfig(process.env);
const live = createHandlers({ complete: config.apiKey ? createGemini(config) : null, model: config.model });
const demo = createHandlers({ complete: null, model: config.model });
const limiter = createRateLimiter({ limit: LIMIT_PER_WINDOW, windowMs: WINDOW_MS });

/** The live handlers, except that provider trouble falls back to the demo answer (which says so in `source`). */
export function withDemoFallback(primary: AiHandlers, fallback: AiHandlers): AiHandlers {
  const wrapped = { ...primary } as Record<string, unknown>;
  for (const key of Object.keys(primary) as (keyof AiHandlers)[]) {
    if (key === 'status') continue;
    const call = primary[key] as (body: unknown) => Promise<unknown>;
    const backup = fallback[key] as (body: unknown) => Promise<unknown>;
    wrapped[key] = async (body: unknown) => {
      try {
        return await call(body);
      } catch (e) {
        const err = toHttpError(e);
        if (!FALLBACK_STATUSES.has(err.status)) throw e;
        console.warn(`[ai] ${String(key)} fell back to demo data (${err.status}): ${err.message}`);
        return backup(body);
      }
    };
  }
  return wrapped as unknown as AiHandlers;
}

const handlers = withDemoFallback(live, demo);

function visitorKey(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/** True when the request comes from another website (a browser always sends Origin on cross-site requests). */
export function isCrossSite(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

async function readBody(req: VercelRequest): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, JSON_ONLY_MESSAGE);
  // Vercel has already read and parsed JSON bodies for us.
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HttpError(400, 'The request body is not valid JSON.');
    }
  }
  if (req.body === undefined) throw new HttpError(400, 'The request body is empty.');
  return req.body;
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  const path = new URL(req.url ?? '/', 'http://local').pathname.replace(/^\/api\/ai/, '') || '/';

  if (isCrossSite(req.headers.origin, req.headers.host)) return send(res, 403, { error: 'This service only answers requests from its own pages.' });

  if (req.method === 'POST') {
    const verdict = limiter.hit(visitorKey(req));
    if (!verdict.ok) return send(res, 429, { error: 'You are going quickly. Please wait a moment and try again.' }, { 'Retry-After': String(verdict.retryAfterSec) });
  }

  const out = await runAiRoute(handlers, { method: req.method, path, readBody: () => readBody(req) });
  send(res, out.status, out.body);
}
