import { Router } from 'express';
import { requireRole } from '../../middleware/require-role';
import { bulkImportChargesHandler } from './bulk-charges.controller';

export const bulkChargesRouter = Router();

bulkChargesRouter.post(
  '/api/admin/bulk-charges/import',
  requireRole(['ADMIN']),
  bulkImportChargesHandler,
);
