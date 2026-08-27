import { z } from 'zod';

export const flaggedFlatsQuerySchema = z.object({
  gracePeriodDays: z.coerce.number().int().positive().optional(),
});
export const dashboardSummaryQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
});
