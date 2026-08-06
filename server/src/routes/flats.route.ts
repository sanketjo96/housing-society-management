import { Router } from 'express';
import {
  assignTenantHandler,
  bulkImportFlatsHandler,
  createFlatHandler,
  listFlatsHandler,
  removeTenantHandler,
  updateFlatHandler,
} from '../controllers/flats.controller';
import { requireRole } from '../middleware/require-role';

export const flatsRouter = Router();
flatsRouter.get('/api/admin/flats', requireRole(['ADMIN']), listFlatsHandler);
flatsRouter.post('/api/admin/flats/import', requireRole(['ADMIN']), bulkImportFlatsHandler);
flatsRouter.post('/api/admin/flats', requireRole(['ADMIN']), createFlatHandler);
flatsRouter.patch('/api/admin/flats/:id', requireRole(['ADMIN']), updateFlatHandler);
flatsRouter.post('/api/admin/flats/:id/tenant', requireRole(['ADMIN']), assignTenantHandler);
flatsRouter.delete('/api/admin/flats/:id/tenant', requireRole(['ADMIN']), removeTenantHandler);
