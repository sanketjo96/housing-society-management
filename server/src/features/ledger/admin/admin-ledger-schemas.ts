import { z } from 'zod';

export const ledgerListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  type: z.enum(['DEPOSIT', 'CREDIT']).optional(),
});
export const rejectLedgerSchema = z.object({ reason: z.string().min(1).optional() });
export const manualDepositSchema = z.object({
  flatId: z.string().min(1),
  amount: z.coerce.number().positive(),
});
