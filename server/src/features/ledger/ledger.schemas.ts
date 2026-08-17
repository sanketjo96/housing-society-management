import { z } from 'zod';

export const ledgerYearQuerySchema = z.object({ year: z.coerce.number().int().optional() });
export const ledgerAmountSchema = z.object({ amount: z.coerce.number().positive() });
export const creditSchema = z.object({
  amount: z.coerce.number().positive(),
  note: z.string().min(1),
});
export const ledgerListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  type: z.enum(['DEPOSIT', 'CREDIT']).optional(),
});
export const rejectLedgerSchema = z.object({ reason: z.string().min(1).optional() });
export const manualDepositSchema = z.object({
  flatId: z.string().min(1),
  amount: z.coerce.number().positive(),
});
