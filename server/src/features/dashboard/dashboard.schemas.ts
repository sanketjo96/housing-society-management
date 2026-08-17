import { z } from 'zod';

export const flaggedFlatsQuerySchema = z.object({
  gracePeriodDays: z.coerce.number().int().positive().optional(),
});
