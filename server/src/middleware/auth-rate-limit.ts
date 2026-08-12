import rateLimit from 'express-rate-limit';

// Applied only to credential-guessing surfaces (login, password-reset request and
// consume) — deliberately not /api/auth/refresh, which is keyed by a high-entropy
// httpOnly-cookie token, not a guessable credential, and is called silently on
// every page load by the frontend's session-restore (AuthContext); rate-limiting
// it risks locking out real users' normal browsing rather than blocking an
// attacker.
//
// Keys per client IP — correct only because app.ts sets `trust proxy` to trust
// exactly one hop, matching this deployment's single reverse proxy (nginx, see
// nginx/default.conf's `proxy_set_header X-Forwarded-For`). Without that, every
// request arrives from nginx's own container IP and every real user would share
// one collective rate-limit bucket.
//
// Disabled during the automated test suite (tests/setup.ts sets
// DISABLE_RATE_LIMIT=true) — the shared `app` instance used by most route tests
// would otherwise trip these limits from ordinary cross-file test traffic (many
// files each calling POST /api/auth/login a few times in their own beforeAll).
// The actual 429 behavior is verified in this file's own dedicated test instead,
// against an isolated limiter instance that doesn't honor the skip.
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

// Shared between /api/auth/request-reset and /api/auth/reset — both are part of
// the same password-reset flow, so an attacker hammering either one draws down
// the same combined budget.
export const passwordResetRateLimiter = createAuthRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please try again in a few minutes.',
});
