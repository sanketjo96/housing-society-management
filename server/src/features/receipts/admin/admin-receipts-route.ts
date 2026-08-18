import { Router } from 'express';
import { listReceiptsHandler } from './admin-receipts-controller';
import { requireRole } from '../../../middleware/require-role';

export const adminReceiptsRouter = Router();

adminReceiptsRouter.get('/api/admin/receipts', requireRole(['ADMIN']), listReceiptsHandler);
