import { z } from 'zod';

const categorySchema = z.enum(['MAINTENANCE', 'OTHER_CHARGE']).default('MAINTENANCE');

export const ledgerYearQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  category: categorySchema,
});
export const balancesQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
});
export const ledgerAmountSchema = z.object({
  amount: z.coerce.number().positive(),
  category: categorySchema,
});
// Resident's optional freeform reason for the payment (e.g. "Aug + Sep combined")
// — shown to the admin in the Payment Proofs queue, and back to the resident on
// their own ledger. Falls back to a default status note when blank.
export const submitPaymentIntentSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
