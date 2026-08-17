import type { Request, Response } from 'express';
import { DuplicateFieldError } from '../../shared/errors/errors';
import { updateMeSchema, updateMyFlatSchema, upsertTenantSchema } from './flats.schemas';
import {
  ConflictingRoleError,
  getMyFlat,
  NoCurrentTenantError,
  removeOwnTenant,
  updateFlat,
  upsertOwnTenant,
} from './resident-flat.service';
import { updateOwnProfile } from './me.service';

// A blank phone input submits as '' (React Hook Form), not undefined — '' must be
// treated as "not provided" here, both so .min(1) doesn't reject an intentionally
// empty field, and so it's never written to User.phone (a @unique column) as a
// literal empty string, which would collide with the next blank submission.
// Combined "one form, one Save changes button" save (resident-experience mockup's My
// details tab) — owner contact + occupancy + tenant contact together, reusing
// updateFlat's exact find-or-create-tenant-inline mechanism (flats.service.ts, the
// 2026-08-06 addendum) rather than duplicating it. wing/flatNumber/baseRate are never
// accepted here — still admin-set, read-only from the resident side (unchanged rule).
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

// req.user.role is guaranteed OWNER or TENANT by requireRole on this route (see
// me.route.ts) — ADMIN never reaches here, so there's no third case to handle.
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
