import { z } from 'zod';

export const searchVehicleQuerySchema = z.object({
  plate: z.string().min(1),
});
