import type { Request, Response } from 'express';
import { z } from 'zod';
import { createUser, DuplicateFieldError, getUserById } from '../services/admin-users.service';

// societyId is deliberately NOT accepted from the client (Phase 9 security-audit
// fix, 2026-08-12) — it was previously read straight from the request body and
// passed through to createUser() unchecked, letting any authenticated ADMIN
// provision a full-privilege account (including role: 'ADMIN') inside an arbitrary
// *other* society by just naming its id. createUserHandler below always uses
// req.user.societyId instead, same pattern as flats.controller.ts's
// createFlatHandler.
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1).optional(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'OWNER', 'TENANT']),
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
  // See getUserHandler above for why this guards against a future route-wiring
  // mistake even though requireRole always sets req.user today.
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
