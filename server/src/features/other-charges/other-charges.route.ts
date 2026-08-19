import { Router } from 'express';
import { billOtherChargeHandler, listOtherChargesHandler } from './other-charges.controller';
import { requireRole } from '../../middleware/require-role';

export const otherChargesRouter = Router();

otherChargesRouter.get('/api/admin/other-charges', requireRole(['ADMIN']), listOtherChargesHandler);
otherChargesRouter.post('/api/admin/other-charges', requireRole(['ADMIN']), billOtherChargeHandler);
