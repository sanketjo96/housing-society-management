import { Router } from 'express';
import {
  generateMaintenanceRecordsHandler,
  listMaintenanceRecordsHandler,
} from '../controllers/maintenance-records.controller';
import { requireRole } from '../middleware/require-role';

export const maintenanceRecordsRouter = Router();
maintenanceRecordsRouter.post(
  '/api/admin/maintenance-records/generate',
  requireRole(['ADMIN']),
  generateMaintenanceRecordsHandler,
);
maintenanceRecordsRouter.get(
  '/api/admin/maintenance-records',
  requireRole(['ADMIN']),
  listMaintenanceRecordsHandler,
);
