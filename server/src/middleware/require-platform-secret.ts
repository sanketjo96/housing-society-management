import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// Gates the society-bootstrap endpoint, which creates the first ADMIN for a new
// society — no JWT can exist yet, so requireRole doesn't apply. A static secret
// only the platform operator holds, compared in constant time.
export function requirePlatformSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PLATFORM_BOOTSTRAP_SECRET;
  if (!expected) {
    // Fail closed — an unset secret is never "no secret required."
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
  // timingSafeEqual throws on mismatched lengths, so length is checked first.
  const matches =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  if (!matches) {
    res.status(403).json({ error: 'Invalid platform bootstrap secret' });
    return;
  }

  next();
}
