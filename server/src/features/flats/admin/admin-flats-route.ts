import { Router } from 'express';
import {
  assignTenantHandler,
  bulkImportFlatsHandler,
  createFlatHandler,
  listFlatsHandler,
  removeTenantHandler,
  updateFlatHandler,
} from './admin-flats-controller';
import { requireRole } from '../../../middleware/require-role';

export const adminFlatsRouter = Router();
adminFlatsRouter.get('/api/admin/flats', requireRole(['ADMIN']), listFlatsHandler);
adminFlatsRouter.post('/api/admin/flats/import', requireRole(['ADMIN']), bulkImportFlatsHandler);
adminFlatsRouter.post('/api/admin/flats', requireRole(['ADMIN']), createFlatHandler);
adminFlatsRouter.patch('/api/admin/flats/:id', requireRole(['ADMIN']), updateFlatHandler);
adminFlatsRouter.post('/api/admin/flats/:id/tenant', requireRole(['ADMIN']), assignTenantHandler);
adminFlatsRouter.delete('/api/admin/flats/:id/tenant', requireRole(['ADMIN']), removeTenantHandler);
