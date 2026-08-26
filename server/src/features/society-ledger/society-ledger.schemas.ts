import { z } from 'zod';

export const bulkImportSocietyLedgerSchema = z.object({ csv: z.string().min(1) });

// The direction-matches-category rule needs a DB lookup, so it's checked in
// recordSocietyLedgerEntry, not here.
export const recordSocietyLedgerEntrySchema = z
  .object({
    direction: z.enum(['INCOME', 'EXPENSE']),
    categoryId: z.string().min(1, 'Category is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    transactionDate: z.coerce.date(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER']),
    bankReference: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((data) => data.paymentMethod === 'CASH' || !!data.bankReference?.trim(), {
    message: 'A bank/transaction reference is required unless payment method is Cash',
    path: ['bankReference'],
  });
