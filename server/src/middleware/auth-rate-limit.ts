import rateLimit from 'express-rate-limit';

// Applied only to credential-guessing surfaces (login, password-reset) — not
// /api/auth/refresh, which is keyed by a high-entropy cookie and called silently
// on every page load. Keys per client IP; requires app.ts's `trust proxy` set to
// exactly one hop (nginx) or every request would share one IP bucket.
//
// Disabled when DISABLE_RATE_LIMIT=true (set by tests/setup.ts) so ordinary
// cross-file test traffic doesn't trip it; 429 behavior has its own dedicated test.
function skipInAutomatedTests(): boolean {
  return process.env.DISABLE_RATE_LIMIT === 'true';
}

export function createAuthRateLimiter(options: { windowMs: number; max: number; message: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInAutomatedTests,
    handler: (_req, res) => {
      res.status(429).json({ error: options.message });
    },
  });
}

export const loginRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in a few minutes.',
});

// Shared budget across /api/auth/request-reset and /api/auth/reset.
export const passwordResetRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please try again in a few minutes.',
});
