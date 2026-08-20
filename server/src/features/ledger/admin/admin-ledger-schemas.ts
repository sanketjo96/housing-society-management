import { z } from 'zod';

export const ledgerListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  category: z.enum(['MAINTENANCE', 'OTHER_CHARGE']).optional(),
  // Mark as Paid page (delinked from Payment Proofs) — filters to entries an admin
  // recorded directly (manualDeposit), never a resident's own Deposit/Credit.
  createdByType: z.enum(['OWNER', 'TENANT', 'ADMIN']).optional(),
});
export const rejectLedgerSchema = z.object({ reason: z.string().min(1).optional() });
export const manualDepositSchema = z.object({
  flatId: z.string().min(1),
  amount: z.coerce.number().positive(),
  category: z.enum(['MAINTENANCE', 'OTHER_CHARGE']).default('MAINTENANCE'),
});
