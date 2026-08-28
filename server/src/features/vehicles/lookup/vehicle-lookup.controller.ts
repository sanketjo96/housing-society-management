import type { Request, Response } from 'express';
import { searchVehicleQuerySchema } from './vehicle-lookup.schemas';
import { searchVehicle } from './vehicle-lookup.service';

export async function searchVehicleHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = searchVehicleQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const result = await searchVehicle(req.user.societyId, parsed.data.plate);
  res.status(200).json(result);
}
