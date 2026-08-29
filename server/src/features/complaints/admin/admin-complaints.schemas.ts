import { z } from 'zod';

export const changeComplaintStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']),
});
