import type { Request, Response } from 'express';
import { loginSchema, requestResetSchema, resetSchema } from './auth.schemas';
import {
  getCurrentUser,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidResetTokenError,
  login,
  logout,
  refreshAccessToken,
  REFRESH_TOKEN_TTL_DAYS,
  requestPasswordReset,
  resetPassword,
} from './auth.service';

const REFRESH_COOKIE_NAME = 'refreshToken';
// Scoped to /api/auth — the only paths that ever need to read it — rather than the
// whole site, so it's never accidentally sent on unrelated requests.
const REFRESH_COOKIE_PATH = '/api/auth';

// `secure` must be driven by its own env var, not NODE_ENV — a Secure cookie is
// silently dropped by browsers over plain HTTP (except for a `localhost` special
// case, which can hide the bug in local testing). Set COOKIE_SECURE=true once
// real HTTPS is in front of this.
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

// --- Session (login / refresh / logout / me) ---

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
  // req.user is always set — requireRole runs first on this route.
  const user = await getCurrentUser(req.user!.id);
  if (!user) {
    // Token valid but the user row is gone.
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.status(200).json(user);
}

// --- Password reset ---

export async function requestResetHandler(req: Request, res: Response) {
  const parsed = requestResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  // Identical response whether or not the email exists.
  await requestPasswordReset(parsed.data.email);
  res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
}

export async function resetHandler(req: Request, res: Response) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    await resetPassword(parsed.data.token, parsed.data.newPassword);
    res.status(200).json({ message: 'Password reset successfully.' });
  } catch (err) {
    if (err instanceof InvalidResetTokenError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}
