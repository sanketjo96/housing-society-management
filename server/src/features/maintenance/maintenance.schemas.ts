import { z } from 'zod';

const periodField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be in YYYY-MM format');

export const generateMaintenanceSchema = z.object({ period: periodField.optional() });

export const listMaintenanceQuerySchema = z.object({
  period: periodField.optional(),
  flatId: z.string().min(1).optional(),
});
