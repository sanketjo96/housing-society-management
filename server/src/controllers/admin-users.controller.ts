import type { Request, Response } from 'express';
import { z } from 'zod';
import { createUser, DuplicateFieldError, getUserById } from '../services/admin-users.service';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1).optional(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'OWNER', 'TENANT']),
  societyId: z.string().min(1),
});

export async function getUserHandler(req: Request, res: Response) {
  // req.user is always set here in practice — requireRole (Task 2.5) runs first on
  // this route — but the type is optional, so this guards against a future route
  // wiring mistake (calling this handler without the middleware) failing loudly
  // instead of crashing on `undefined.societyId`.
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
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await createUser(parsed.data);
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}
