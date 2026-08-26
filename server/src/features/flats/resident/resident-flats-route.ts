import { Router } from 'express';
import {
  getMyFlatHandler,
  removeMyTenantHandler,
  updateMyFlatHandler,
  upsertMyTenantHandler,
} from './resident-flats-controller';
import { requireRole } from '../../../middleware/require-role';

export const residentFlatsRouter = Router();
residentFlatsRouter.get('/api/me/flat', requireRole(['OWNER', 'TENANT']), getMyFlatHandler);
// PUT /api/me/flat is the primary combined save; the tenant-only endpoints below
// are a lower-level alternative.
residentFlatsRouter.put('/api/me/flat', requireRole(['OWNER']), updateMyFlatHandler);
residentFlatsRouter.put('/api/me/flat/tenant', requireRole(['OWNER']), upsertMyTenantHandler);
residentFlatsRouter.delete('/api/me/flat/tenant', requireRole(['OWNER']), removeMyTenantHandler);
