import type { Request, Response } from 'express';
import { z } from 'zod';
import { DuplicateFieldError } from '../lib/errors';
import {
  assignTenant,
  bulkImportFlats,
  ConflictingRoleError,
  createFlat,
  InvalidTenantError,
  listFlats,
  NoCurrentTenantError,
  removeTenant,
  TenantAlreadyAssignedError,
  updateFlat,
} from '../services/flats.service';

// Owner/tenant are contact fields (name/phone/email), not ids — createFlat/updateFlat
// find-or-create the underlying User accounts (see CLAUDE.md's "Addition
// (2026-08-06)"), matching the admin UI's single flat-onboarding form.
const occupancyFields = {
  occupancy: z.enum(['owner', 'tenant']).optional(),
  tenantName: z.string().min(1).optional(),
  tenantPhone: z.string().min(1).optional(),
  tenantEmail: z.string().email().optional(),
  effectiveFrom: z.coerce.date().optional(),
};

const createFlatSchema = z.object({
  wing: z.string().min(1),
  flatNumber: z.string().min(1),
  baseRate: z.coerce.number().positive(),
  ownerName: z.string().min(1),
  ownerPhone: z.string().min(1).optional(),
  ownerEmail: z.string().email(),
  ...occupancyFields,
});

const updateFlatSchema = z
  .object({
    baseRate: z.coerce.number().positive(),
    ownerName: z.string().min(1),
    ownerPhone: z.string().min(1),
    ownerEmail: z.string().email(),
    ...occupancyFields,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

const assignTenantSchema = z.object({
  tenantId: z.string().min(1),
});

const bulkImportSchema = z.object({
  csv: z.string().min(1),
});

export async function listFlatsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const flats = await listFlats(req.user.societyId);
  res.status(200).json(flats);
}

export async function bulkImportFlatsHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = bulkImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const result = await bulkImportFlats(req.user.societyId, parsed.data.csv);
  res.status(200).json(result);
}

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

export async function assignTenantHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = assignTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const flat = await assignTenant(req.params.id, req.user.societyId, parsed.data.tenantId);
    if (!flat) {
      res.status(404).json({ error: 'Flat not found' });
      return;
    }
    res.status(200).json(flat);
  } catch (err) {
    if (err instanceof InvalidTenantError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof TenantAlreadyAssignedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function removeTenantHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const flat = await removeTenant(req.params.id, req.user.societyId);
    if (!flat) {
      res.status(404).json({ error: 'Flat not found' });
      return;
    }
    res.status(200).json(flat);
  } catch (err) {
    if (err instanceof NoCurrentTenantError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}
