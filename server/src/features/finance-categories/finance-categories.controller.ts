import type { Request, Response } from 'express';
import {
  createFinanceCategorySchema,
  listFinanceCategoriesQuerySchema,
  updateFinanceCategorySchema,
} from './finance-categories.schemas';
import {
  createFinanceCategory,
  FinanceCategoryNotFoundError,
  listFinanceCategories,
  updateFinanceCategory,
} from './finance-categories.service';
import { DuplicateFieldError } from '../../shared/errors/errors';

export async function listFinanceCategoriesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = listFinanceCategoriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const categories = await listFinanceCategories(
    req.user.societyId,
    parsed.data.includeInactive ?? false,
    parsed.data.direction,
  );
  res.status(200).json(categories);
}

export async function createFinanceCategoryHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = createFinanceCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const category = await createFinanceCategory(req.user.societyId, req.user.id, parsed.data);
    res.status(201).json(category);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateFinanceCategoryHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = updateFinanceCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const category = await updateFinanceCategory(req.params.id, req.user.societyId, req.user.id, parsed.data);
    res.status(200).json(category);
  } catch (err) {
    if (err instanceof FinanceCategoryNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
