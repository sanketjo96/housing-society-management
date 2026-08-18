import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1).optional(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'OWNER', 'TENANT']),
});
