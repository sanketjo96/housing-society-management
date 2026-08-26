import { z } from 'zod';

export const createFeeTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

// Partial update. isActive is the only removal mechanism — never hard-deleted.
export const updateFeeTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const listFeeTypesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional(),
});
