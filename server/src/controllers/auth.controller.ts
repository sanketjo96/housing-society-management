import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  login,
  logout,
  refreshAccessToken,
} from '../services/auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await login(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function refreshHandler(req: Request, res: Response) {
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await refreshAccessToken(parsed.data.refreshToken);
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
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  await logout(parsed.data.refreshToken);
  res.status(200).json({ message: 'Logged out' });
}
