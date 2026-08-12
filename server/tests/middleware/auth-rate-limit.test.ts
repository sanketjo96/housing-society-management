import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthRateLimiter } from '../../src/middleware/auth-rate-limit';

function buildTestApp() {
  const app = express();
  app.use(
    '/limited',
    createAuthRateLimiter({ windowMs: 60_000, max: 2, message: 'Too many attempts.' }),
  );
  app.post('/limited', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('createAuthRateLimiter', () => {
  it('allows requests up to the limit, then returns 429 with no leaked internals', async () => {
    // The global test suite runs with DISABLE_RATE_LIMIT=true (tests/setup.ts) so
    // ordinary cross-file traffic never trips the real auth routes' limits — but
    // that means a limiter built here would be inert too, since it checks the same
    // env var. Force it off just for this one test, so the actual 429 path gets
    // exercised, then restore the suite-wide default.
    const previousFlag = process.env.DISABLE_RATE_LIMIT;
    delete process.env.DISABLE_RATE_LIMIT;
    try {
      const app = buildTestApp();

      const first = await request(app).post('/limited');
      expect(first.status).toBe(200);

      const second = await request(app).post('/limited');
      expect(second.status).toBe(200);

      const third = await request(app).post('/limited');
      expect(third.status).toBe(429);
      expect(third.body).toEqual({ error: 'Too many attempts.' });
    } finally {
      process.env.DISABLE_RATE_LIMIT = previousFlag;
    }
  });

  it('is disabled in the automated test suite via DISABLE_RATE_LIMIT (the real auth routes use this)', async () => {
    // Sanity-check the flag tests/setup.ts relies on — proves the shared
    // login/password-reset routes never actually enforce a limit during this
    // suite's own test run.
    expect(process.env.DISABLE_RATE_LIMIT).toBe('true');

    const app = buildTestApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/limited');
      expect(res.status).toBe(200);
    }
  });
});
