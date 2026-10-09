import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors';
import { createHandlers } from '../handlers';
import { createRateLimiter } from '../rateLimit';
import handler, { isCrossSite, withDemoFallback } from '../vercelHandler';

describe('rate limiter', () => {
  it('lets a visitor through up to the limit, then says when to come back', () => {
    let t = 1_000;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect([1, 2, 3].map(() => rl.hit('a').ok)).toEqual([true, true, true]);
    const over = rl.hit('a');
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBeGreaterThan(0);
    expect(rl.hit('b').ok).toBe(true); // someone else is not affected
    t += 61_000;
    expect(rl.hit('a').ok).toBe(true); // a new window starts
  });
});

describe('isCrossSite', () => {
  it('only allows a page on the same host', () => {
    expect(isCrossSite(undefined, 'app.vercel.app')).toBe(false); // same-origin GETs send no Origin
    expect(isCrossSite('https://app.vercel.app', 'app.vercel.app')).toBe(false);
    expect(isCrossSite('https://evil.example', 'app.vercel.app')).toBe(true);
    expect(isCrossSite('not a url', 'app.vercel.app')).toBe(true);
  });
});

describe('withDemoFallback', () => {
  const demo = createHandlers({ complete: null, model: 'm' });
  const failing = (status: number) => ({ ...demo, scan: vi.fn(async () => { throw new HttpError(status, 'provider trouble'); }) });
  const scanBody = { claimType: 'AUTO', documents: [{ fileName: 'e.png', mimeType: 'image/png', data: 'AAAA' }] };

  it.each([429, 503, 504])('answers with labelled demo data when the provider says %i', async (status) => {
    const out = (await withDemoFallback(failing(status), demo).scan(scanBody)) as { source: string };
    expect(out.source).toBe('demo');
  });

  it('does not hide mistakes by the caller (a 400 is still a 400)', async () => {
    await expect(withDemoFallback(failing(400), demo).scan(scanBody)).rejects.toMatchObject({ status: 400 });
  });

  it('passes live answers through untouched', async () => {
    const live = { ...demo, scan: vi.fn(async () => ({ source: 'ai' })) };
    expect(await withDemoFallback(live as never, demo).scan(scanBody)).toEqual({ source: 'ai' });
  });
});

// The real function, called the way Vercel calls it: JSON bodies already parsed onto req.body.
describe('the function over HTTP (demo mode)', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const r = req as typeof req & { body?: unknown };
        if (raw && (req.headers['content-type'] ?? '').startsWith('application/json')) r.body = JSON.parse(raw);
        else if (raw) r.body = raw;
        void handler(r, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const post = (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
    fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('reports its status', async () => {
    const res = await fetch(base + '/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ configured: false });
  });

  it('answers a real request', async () => {
    const res = await post('/scan', { claimType: 'AUTO', documents: [{ fileName: 'e.png', mimeType: 'image/png', data: 'AAAA' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'demo' });
  });

  it('refuses non-JSON and other websites', async () => {
    expect((await post('/scan', '{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post('/scan', {}, { 'Content-Type': 'application/json', Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('404s unknown endpoints', async () => {
    expect((await post('/nope', {})).status).toBe(404);
  });
});
