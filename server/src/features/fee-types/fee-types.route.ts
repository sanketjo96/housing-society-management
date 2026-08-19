import { Router } from 'express';
import { createFeeTypeHandler, listFeeTypesHandler, updateFeeTypeHandler } from './fee-types.controller';
import { requireRole } from '../../middleware/require-role';

export const feeTypesRouter = Router();

feeTypesRouter.get('/api/admin/fee-types', requireRole(['ADMIN']), listFeeTypesHandler);
feeTypesRouter.post('/api/admin/fee-types', requireRole(['ADMIN']), createFeeTypeHandler);
feeTypesRouter.patch('/api/admin/fee-types/:id', requireRole(['ADMIN']), updateFeeTypeHandler);
