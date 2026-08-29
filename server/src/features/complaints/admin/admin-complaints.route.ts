import { Router } from 'express';
import { changeComplaintStatusHandler } from './admin-complaints.controller';
import { requireRole } from '../../../middleware/require-role';

export const adminComplaintsRouter = Router();

adminComplaintsRouter.patch(
  '/api/admin/complaints/:id/status',
  requireRole(['ADMIN']),
  changeComplaintStatusHandler,
);
