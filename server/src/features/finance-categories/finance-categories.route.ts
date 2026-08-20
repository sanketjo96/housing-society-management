import { Router } from 'express';
import {
  createFinanceCategoryHandler,
  listFinanceCategoriesHandler,
  updateFinanceCategoryHandler,
} from './finance-categories.controller';
import { requireRole } from '../../middleware/require-role';

export const financeCategoriesRouter = Router();

financeCategoriesRouter.get('/api/admin/finance-categories', requireRole(['ADMIN']), listFinanceCategoriesHandler);
financeCategoriesRouter.post('/api/admin/finance-categories', requireRole(['ADMIN']), createFinanceCategoryHandler);
financeCategoriesRouter.patch(
  '/api/admin/finance-categories/:id',
  requireRole(['ADMIN']),
  updateFinanceCategoryHandler,
);
