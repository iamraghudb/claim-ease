import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandlers } from '../handlers';
import { createAiMiddleware } from '../http';

// A real HTTP server around the middleware (demo mode: no key, no network calls to Google).
let server: Server;
let base = '';

beforeAll(async () => {
  const middleware = createAiMiddleware(createHandlers({ complete: null, model: 'test-model' }));
  server = createServer((req, res) => {
    // Vite mounts the middleware at /api/ai and strips that prefix; do the same here.
    req.url = (req.url ?? '').replace(/^\/api\/ai/, '');
    void middleware(req, res, () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('AI endpoints over HTTP', () => {
  it('GET /status reports demo mode and the model', async () => {
    const res = await fetch(`${base}/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, model: 'test-model' });
  });

  it('POST /scan works end to end in demo mode', async () => {
    const res = await post('/scan', { claimType: 'AUTO', documents: [{ fileName: 'e.png', mimeType: 'image/png', data: 'AAAA' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'demo' });
  });

  it('refuses requests that are not application/json (blocks cross-site form posts)', async () => {
    const res = await post('/scan', '{}', { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
  });

  it('returns JSON errors for bad input, unknown routes and wrong methods', async () => {
    expect((await post('/scan', 'not json')).status).toBe(400);
    expect((await post('/scan', { claimType: 'AUTO', documents: [] })).status).toBe(400);
    const unknown = await post('/nope', {});
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toHaveProperty('error');
    expect((await fetch(`${base}/scan`)).status).toBe(405);
  });
});
