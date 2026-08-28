import { Router } from 'express';
import {
  deleteMyVehicleHandler,
  listMyVehiclesHandler,
  registerVehicleHandler,
} from './resident-vehicles.controller';
import { requireRole } from '../../../middleware/require-role';

export const residentVehiclesRouter = Router();
residentVehiclesRouter.get('/api/me/vehicles', requireRole(['OWNER', 'TENANT']), listMyVehiclesHandler);
residentVehiclesRouter.post('/api/me/vehicles', requireRole(['OWNER', 'TENANT']), registerVehicleHandler);
residentVehiclesRouter.delete(
  '/api/me/vehicles/:id',
  requireRole(['OWNER', 'TENANT']),
  deleteMyVehicleHandler,
);
