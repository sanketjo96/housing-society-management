import type { Request, Response } from 'express';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { updateMeSchema } from './profile-schemas';
import { updateOwnProfile } from './profile-service';

// Generic account self-service, usable by any authenticated role — not flat-specific
// (see features/flats/resident/ for the flat/tenant self-service that is).
export async function updateMeHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await updateOwnProfile(req.user.id, parsed.data);
    res.status(200).json(user);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}
