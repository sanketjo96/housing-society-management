import { z } from 'zod';

export const billOtherChargeSchema = z.object({
  flatId: z.string().min(1, 'Flat is required'),
  feeTypeId: z.string().min(1, 'Fee type is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  note: z.string().optional(),
});
