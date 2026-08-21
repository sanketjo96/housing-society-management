import { z } from 'zod';

export const bootstrapSocietySchema = z.object({
  societyName: z.string().min(1, 'Society name is required'),
  societyAddress: z.string().min(1, 'Society address is required'),
  adminName: z.string().min(1, "Admin's name is required"),
  adminEmail: z.string().email('Enter a valid email address'),
});
