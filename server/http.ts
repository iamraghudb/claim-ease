// The thin HTTP layer: reads JSON in, writes JSON out, maps errors to status codes.
// The real work is in handlers.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { HttpError, toHttpError } from './errors';
import type { AiHandlers } from './handlers';

// Google accepts about 20 MB of inline data per request, so there is no point accepting much more.
const MAX_BODY_BYTES = 32 * 1024 * 1024;

async function readJson(req: IncomingMessage): Promise<unknown> {
  // Requiring application/json is also our guard against other websites: a browser will not send
  // that content type cross-origin without a permission check ("preflight") that we never grant.
  // So only this app's own pages can spend your API credits.
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Mounted at /api/ai, so a request to /api/ai/scan arrives here as "/scan". */
export function createAiMiddleware(handlers: AiHandlers): Connect.NextHandleFunction {
  const routes: Record<string, (body: unknown) => Promise<unknown>> = {
    '/scan': handlers.scan,
    '/gaps': handlers.gaps,
    '/explain': handlers.explain,
    '/chat': handlers.copilot,
    '/intake': handlers.intake,
    '/brief': handlers.brief,
    '/draft': handlers.draft,
    '/insights': handlers.insights,
    '/photo': handlers.photo,
  };

  return async (req, res) => {
    const path = (req.url ?? '').split('?')[0];
    try {
      if (req.method === 'GET' && path === '/status') return send(res, 200, handlers.status());
      const route = routes[path];
      if (!route) throw new HttpError(404, 'Unknown AI endpoint.');
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
      return send(res, 200, await route(await readJson(req)));
    } catch (e) {
      const err = toHttpError(e);
      // Log the reason (never the request body: it can contain personal data).
      if (err.status >= 500 || !(e instanceof HttpError)) console.error(`[ai] ${path} failed: ${err.message}`, e instanceof Error && e !== err ? `(${e.name})` : '');
      send(res, err.status, { error: err.message });
    }
  };
}
