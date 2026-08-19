import type { Request, Response } from 'express';
import {
  createFeeTypeSchema,
  listFeeTypesQuerySchema,
  updateFeeTypeSchema,
} from './fee-types.schemas';
import { createFeeType, FeeTypeNotFoundError, listFeeTypes, updateFeeType } from './fee-types.service';
import { DuplicateFieldError } from '../../shared/errors/errors';

export async function listFeeTypesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = listFeeTypesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const feeTypes = await listFeeTypes(req.user.societyId, parsed.data.includeInactive ?? false);
  res.status(200).json(feeTypes);
}

export async function createFeeTypeHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = createFeeTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const feeType = await createFeeType(req.user.societyId, req.user.id, parsed.data);
    res.status(201).json(feeType);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateFeeTypeHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateFeeTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const feeType = await updateFeeType(req.params.id, req.user.societyId, req.user.id, parsed.data);
    res.status(200).json(feeType);
  } catch (err) {
    if (err instanceof FeeTypeNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}
