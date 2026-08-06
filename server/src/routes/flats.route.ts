import { Router } from 'express';
import { createFlatHandler, updateFlatHandler } from '../controllers/flats.controller';
import { requireRole } from '../middleware/require-role';

export const flatsRouter = Router();
flatsRouter.post('/api/admin/flats', requireRole(['ADMIN']), createFlatHandler);
flatsRouter.patch('/api/admin/flats/:id', requireRole(['ADMIN']), updateFlatHandler);
