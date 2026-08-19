import { z } from 'zod';

export const createFeeTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

// Every field optional — a partial update. isActive is the only removal mechanism
// (docs/other-charges/ — never hard-deleted, a billed OtherCharge must keep a valid
// reference forever).
export const updateFeeTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const listFeeTypesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional(),
});
