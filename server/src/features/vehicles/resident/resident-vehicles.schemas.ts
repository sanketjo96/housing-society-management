import { z } from 'zod';

export const registerVehicleSchema = z.object({
  plateNumber: z.string().min(1),
  type: z.enum(['TWO_WHEELER', 'FOUR_WHEELER']),
});
