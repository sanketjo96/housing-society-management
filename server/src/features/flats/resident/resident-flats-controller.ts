import type { Request, Response } from 'express';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { updateMyFlatSchema, upsertTenantSchema } from './resident-flats-schemas';
import {
  ConflictingRoleError,
  getMyFlat,
  NoCurrentTenantError,
  removeOwnTenant,
  updateFlat,
  upsertOwnTenant,
} from './resident-flats-service';

// req.user.role is guaranteed OWNER or TENANT by requireRole on this route.
export async function getMyFlatHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flat = await getMyFlat(
    req.user.id,
    req.user.societyId,
    req.user.role as 'OWNER' | 'TENANT',
  );
  if (!flat) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }
  res.status(200).json(flat);
}

export async function upsertMyTenantHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = upsertTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const myFlat = await getMyFlat(req.user.id, req.user.societyId, 'OWNER');
  if (!myFlat) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const flat = await upsertOwnTenant(myFlat.id, req.user.societyId, req.user.id, parsed.data);
    res.status(200).json(flat);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}

// One combined save — owner contact + occupancy + tenant — reusing updateFlat's
// find-or-create-tenant-inline mechanism. wing/flatNumber/baseRate are never
// accepted here; admin-set and read-only from the resident side.
export async function updateMyFlatHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateMyFlatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const myFlat = await getMyFlat(req.user.id, req.user.societyId, 'OWNER');
  if (!myFlat) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const flat = await updateFlat(myFlat.id, req.user.societyId, parsed.data);
    res.status(200).json(flat);
  } catch (err) {
    if (err instanceof ConflictingRoleError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}

export async function removeMyTenantHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const myFlat = await getMyFlat(req.user.id, req.user.societyId, 'OWNER');
  if (!myFlat) {
    res.status(404).json({ error: 'No flat associated with your account' });
    return;
  }

  try {
    const flat = await removeOwnTenant(myFlat.id, req.user.societyId, req.user.id);
    res.status(200).json(flat);
  } catch (err) {
    if (err instanceof NoCurrentTenantError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}
