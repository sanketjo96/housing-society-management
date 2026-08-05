import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  InvalidResetTokenError,
  requestPasswordReset,
  resetPassword,
} from '../services/password-reset.service';

const requestResetSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function requestResetHandler(req: Request, res: Response) {
  const parsed = requestResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  // Deliberately identical response whether or not the email exists — same
  // non-enumeration principle as login (Task 2.2).
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
