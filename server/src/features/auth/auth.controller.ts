import type { Request, Response } from 'express';
import { loginSchema } from './auth.schemas';
import {
  getCurrentUser,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  login,
  logout,
  refreshAccessToken,
  REFRESH_TOKEN_TTL_DAYS,
} from './auth.service';

const REFRESH_COOKIE_NAME = 'refreshToken';
// Scoped to /api/auth — the only paths that ever need to read it — rather than the
// whole site, so it's never accidentally sent on unrelated requests.
const REFRESH_COOKIE_PATH = '/api/auth';

// GOTCHA (found via a real end-to-end check against the live public IP, not assumed):
// this must NOT be tied to NODE_ENV. NODE_ENV is already "production" in the deployed
// Docker stack, but there's no HTTPS yet — Certbot SSL is Task 10.2, not built. A
// `Secure` cookie is never sent back by a real browser over plain HTTP except for the
// special `localhost` exception (which made this look fine when first tested against
// `http://localhost/` — it silently broke `/api/auth/refresh` the moment the same
// test ran against the real public IP instead). Driven by its own explicit env var
// so it can't accidentally piggyback on NODE_ENV again. Task 10.2 must set
// COOKIE_SECURE=true once real HTTPS exists — until then, this defaults to false.
const refreshCookieOptions = {
  httpOnly: true, // never readable by JS — the entire point (Task 2.7's "httpOnly cookie preferred")
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const { accessToken, refreshToken, user } = await login(parsed.data);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.status(200).json({ accessToken, user });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function refreshHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    res.status(401).json({ error: 'Missing refresh token cookie' });
    return;
  }

  try {
    const result = await refreshAccessToken(refreshToken);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function logoutHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    await logout(refreshToken);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(200).json({ message: 'Logged out' });
}

export async function meHandler(req: Request, res: Response) {
  // req.user is always set — requireRole runs first on this route (see auth.route.ts).
  const user = await getCurrentUser(req.user!.id);
  if (!user) {
    // Token is valid but the user row is gone — theoretically possible, not reachable
    // in this MVP (no user-deletion feature exists), but a real user account must
    // never be assumed to still exist just because their token verified.
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.status(200).json(user);
}
