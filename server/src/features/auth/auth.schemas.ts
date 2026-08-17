import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const requestResetSchema = z.object({ email: z.string().email() });

export const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});
