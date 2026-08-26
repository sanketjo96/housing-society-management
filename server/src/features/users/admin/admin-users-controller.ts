import type { Request, Response } from 'express';
import { createUser, DuplicateFieldError, getUserById } from './admin-users-service';
import { createUserSchema } from './admin-users-schemas';

// societyId is never accepted from the client — always req.user.societyId, so an
// ADMIN can't provision an account in another society by naming its id.
export async function getUserHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const user = await getUserById(req.params.id, req.user.societyId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.status(200).json(user);
}

export async function createUserHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await createUser({ ...parsed.data, societyId: req.user.societyId });
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}
