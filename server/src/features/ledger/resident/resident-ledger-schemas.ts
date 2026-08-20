import { z } from 'zod';

const categorySchema = z.enum(['MAINTENANCE', 'OTHER_CHARGE']).default('MAINTENANCE');

export const ledgerYearQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  category: categorySchema,
});
export const ledgerAmountSchema = z.object({
  amount: z.coerce.number().positive(),
  category: categorySchema,
});
