import { z } from 'zod';

export const updateMeSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
