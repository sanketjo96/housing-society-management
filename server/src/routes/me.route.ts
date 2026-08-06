import { Router } from 'express';
import {
  getMyFlatHandler,
  getMyMaintenanceRecordsHandler,
  removeMyTenantHandler,
  updateMeHandler,
  upsertMyTenantHandler,
} from '../controllers/me.controller';
import { requireRole } from '../middleware/require-role';

export const meRouter = Router();
meRouter.patch('/api/me', requireRole(['ADMIN', 'OWNER', 'TENANT']), updateMeHandler);
meRouter.get('/api/me/flat', requireRole(['OWNER', 'TENANT']), getMyFlatHandler);
meRouter.put('/api/me/flat/tenant', requireRole(['OWNER']), upsertMyTenantHandler);
meRouter.delete('/api/me/flat/tenant', requireRole(['OWNER']), removeMyTenantHandler);
meRouter.get(
  '/api/me/maintenance-records',
  requireRole(['OWNER', 'TENANT']),
  getMyMaintenanceRecordsHandler,
);
