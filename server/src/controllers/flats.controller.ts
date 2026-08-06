import type { Request, Response } from 'express';
import { z } from 'zod';
import { DuplicateFieldError } from '../lib/errors';
import { createFlat, InvalidOwnerError, updateFlat } from '../services/flats.service';

const createFlatSchema = z.object({
  block: z.string().min(1),
  flatNumber: z.string().min(1),
  baseRate: z.coerce.number().positive(),
  ownerId: z.string().min(1),
});

const updateFlatSchema = z
  .object({
    block: z.string().min(1),
    flatNumber: z.string().min(1),
    baseRate: z.coerce.number().positive(),
    ownerId: z.string().min(1),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export async function createFlatHandler(req: Request, res: Response) {
  // See admin-users.controller.ts's getUserHandler for why this guards against a
  // future route-wiring mistake even though requireRole always sets req.user today.
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = createFlatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const flat = await createFlat({ ...parsed.data, societyId: req.user.societyId });
    res.status(201).json(flat);
  } catch (err) {
    if (err instanceof InvalidOwnerError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}

export async function updateFlatHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateFlatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const flat = await updateFlat(req.params.id, req.user.societyId, parsed.data);
    if (!flat) {
      res.status(404).json({ error: 'Flat not found' });
      return;
    }
    res.status(200).json(flat);
  } catch (err) {
    if (err instanceof InvalidOwnerError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}
