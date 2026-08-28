import type { Request, Response } from 'express';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { registerVehicleSchema } from './resident-vehicles.schemas';
import {
  deleteMyVehicle,
  listMyVehicles,
  registerVehicle,
  VehicleNotFoundError,
} from './resident-vehicles.service';

export async function listMyVehiclesHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const vehicles = await listMyVehicles(req.user.societyId, req.user.id);
  res.status(200).json(vehicles);
}

export async function registerVehicleHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const parsed = registerVehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const vehicle = await registerVehicle(req.user.societyId, req.user.id, parsed.data);
    res.status(201).json(vehicle);
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: `${err.fields.join(', ')} already in use` });
      return;
    }
    throw err;
  }
}

export async function deleteMyVehicleHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    await deleteMyVehicle(req.params.id, req.user.societyId, req.user.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof VehicleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
