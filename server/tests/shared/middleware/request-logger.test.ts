import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function buildTestApp() {
  // Force production mode so the underlying logger has no pino-pretty transport —
  // that transport writes from a separate worker thread, which never goes through
  // this process's process.stdout.write, making it unobservable here. Plain JSON
  // output (production behavior) writes synchronously in this thread instead.
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  vi.resetModules();
  const { requestLogger } = await import('../../../src/middleware/requestLogger');
  process.env.NODE_ENV = originalNodeEnv;

  const app = express();
  app.use(requestLogger);
  app.get('/ping', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('requestLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('emits one structured JSON line per request with method/url/status/duration/id/feature (R3)', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const app = await buildTestApp();
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);

    const lines = writeSpy.mock.calls
      .map((call) => String(call[0]).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    // pino-http emits a single combined line per request, once the response finishes.
    const line = lines.find((entry) => entry.req && entry.res);

    expect(line).toMatchObject({
      feature: 'http',
      req: { method: 'GET', url: '/ping' },
      res: { statusCode: 200 },
    });
    expect(line.req.id).toBeDefined();
    expect(line.responseTime).toBeGreaterThanOrEqual(0);
  });
});
