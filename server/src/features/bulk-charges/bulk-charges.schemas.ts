import { z } from 'zod';

export const bulkImportChargesSchema = z.object({ csv: z.string().min(1) });
