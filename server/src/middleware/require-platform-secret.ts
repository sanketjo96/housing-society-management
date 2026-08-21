import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// Gates Phase A's society-bootstrap endpoint (platform-bootstrap.route.ts) — the one
// endpoint in this app that creates a brand-new Society + its first ADMIN user, so it
// necessarily runs *before* any admin account (and therefore any JWT) exists for that
// society. requireRole can't apply here for exactly that reason — there's no role to
// check without a token, and no token without an account that doesn't exist yet.
// Same trust model as JWT_ACCESS_SECRET: a static value only the platform operator
// holds (never issued to a client), compared in constant time so response timing
// can't be used to guess the secret one byte at a time. See
// docs/society-onboarding/02-architecture.md's "Phase A" flow.
export function requirePlatformSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PLATFORM_BOOTSTRAP_SECRET;
  if (!expected) {
    // Fail closed, not fail open — an unset secret must never be treated as "no
    // secret required." 503 (not 500) since this is a configuration gap, not a bug.
    res.status(503).json({ error: 'Platform bootstrap is not configured on this server' });
    return;
  }

  const provided = req.headers['x-platform-bootstrap-secret'];
  if (typeof provided !== 'string' || provided.length === 0) {
    res.status(403).json({ error: 'Missing X-Platform-Bootstrap-Secret header' });
    return;
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // timingSafeEqual throws on mismatched lengths, so the length check must come
  // first — this does leak length via early-exit timing, but the secret is a long
  // random value never guessable from a length alone, an acceptable tradeoff at
  // this MVP's actual threat model (CLAUDE.md: correctness over scale).
  const matches =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  if (!matches) {
    res.status(403).json({ error: 'Invalid platform bootstrap secret' });
    return;
  }

  next();
}
