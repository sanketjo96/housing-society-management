import type { Request, Response } from 'express';
import { DuplicateFieldError } from '../../shared/errors/errors';
import { bootstrapSocietySchema } from './platform-bootstrap.schemas';
import { bootstrapSociety } from './platform-bootstrap.service';

// No req.user check here (unlike every other admin controller) — this endpoint runs
// behind requirePlatformSecret, not requireRole, and by design creates the very
// first admin account for a society that doesn't exist yet. There is no
// authenticated user to check.
export async function bootstrapSocietyHandler(req: Request, res: Response) {
  const parsed = bootstrapSocietySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await bootstrapSociety(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}
