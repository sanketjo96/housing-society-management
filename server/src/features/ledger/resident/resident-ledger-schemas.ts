import { z } from 'zod';

export const ledgerYearQuerySchema = z.object({ year: z.coerce.number().int().optional() });
export const ledgerAmountSchema = z.object({ amount: z.coerce.number().positive() });
export const creditSchema = z.object({
  amount: z.coerce.number().positive(),
  note: z.string().min(1),
});
