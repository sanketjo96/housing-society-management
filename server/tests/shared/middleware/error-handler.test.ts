import 'express-async-errors';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../src/middleware/error-handler';

async function buildAppWithFreshProductionLogger() {
  // Force production mode so the underlying logger writes plain JSON synchronously
  // in this thread, rather than via pino-pretty's worker thread (unobservable
  // through process.stdout.write here) — same technique as request-logger.test.ts.
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  vi.resetModules();
  const { errorHandler: freshErrorHandler } = await import('../../../src/middleware/error-handler');
  process.env.NODE_ENV = originalNodeEnv;

  const app = express();
  app.get('/boom', async () => {
    throw new Error('unexpected failure with sensitive internals');
  });
  app.use(freshErrorHandler);
  return app;
}

// Regression test for a Phase 9 security-audit finding: Express 4 does not catch a
// promise rejected by an async route handler — confirmed empirically that without
// `express-async-errors` patching the router (imported at the very top of app.ts,
// before any route is registered), an uncaught throw inside any async handler
// crashes the entire Node process instead of ever reaching this middleware. Every
// controller's `throw err;` fallback (the "let the global handler deal with
// anything unexpected" pattern used throughout src/features/*/*.controller.ts) relies on
// this actually working.
function buildTestApp() {
  const app = express();
  app.get('/boom', async () => {
    throw new Error('unexpected failure with sensitive internals');
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler + express-async-errors', () => {
  it('turns an uncaught throw inside an async handler into a 500, instead of crashing the process', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    // Never leak the real error message/stack to the client — see error-handler.ts.
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('sensitive internals');
  });

  it('still logs the real error server-side, for observability', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const app = await buildAppWithFreshProductionLogger();
      await request(app).get('/boom');

      const lines = writeSpy.mock.calls
        .map((call) => String(call[0]).trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const errorLine = lines.find((line) => line.level === 'error');

      expect(errorLine).toMatchObject({ feature: 'error-handler', msg: 'unhandled error' });
      expect(errorLine.err?.message).toContain('unexpected failure with sensitive internals');
    } finally {
      writeSpy.mockRestore();
      vi.resetModules();
    }
  });
});
