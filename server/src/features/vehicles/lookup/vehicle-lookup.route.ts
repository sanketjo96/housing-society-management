import { Router } from 'express';
import { searchVehicleHandler } from './vehicle-lookup.controller';
import { requireRole } from '../../../middleware/require-role';

export const vehicleLookupRouter = Router();
// Any authenticated resident or admin can search — never public/unauthenticated.
vehicleLookupRouter.get(
  '/api/vehicles/search',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  searchVehicleHandler,
);
