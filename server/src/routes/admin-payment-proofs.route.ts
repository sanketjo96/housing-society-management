import { Router } from 'express';
import {
  approveProofHandler,
  listPaymentProofsHandler,
  markRecordsPaidHandler,
  rejectProofHandler,
} from '../controllers/payment-proofs.controller';
import { requireRole } from '../middleware/require-role';

export const adminPaymentProofsRouter = Router();

adminPaymentProofsRouter.get('/api/admin/payment-proofs', requireRole(['ADMIN']), listPaymentProofsHandler);
adminPaymentProofsRouter.post(
  '/api/admin/payment-proofs/:id/approve',
  requireRole(['ADMIN']),
  approveProofHandler,
);
adminPaymentProofsRouter.post('/api/admin/payment-proofs/:id/reject', requireRole(['ADMIN']), rejectProofHandler);
adminPaymentProofsRouter.post(
  '/api/admin/maintenance-records/mark-paid',
  requireRole(['ADMIN']),
  markRecordsPaidHandler,
);
