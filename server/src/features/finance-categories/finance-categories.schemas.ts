import { z } from 'zod';

export const createFinanceCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  direction: z.enum(['INCOME', 'EXPENSE']),
  description: z.string().optional(),
});

// isActive-only — see updateFinanceCategory's comment on why this is tighter than
// updateFeeTypeSchema (no rename in v1, docs/manage-finance/05-future-scope.md).
export const updateFinanceCategorySchema = z.object({
  isActive: z.boolean(),
});

export const listFinanceCategoriesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional(),
  direction: z.enum(['INCOME', 'EXPENSE']).optional(),
});
