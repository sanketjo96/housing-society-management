import { Router } from 'express';
import {
  generatePaymentQrHandler,
  getProofFileHandler,
  uploadPaymentProofHandler,
} from '../controllers/payment-proofs.controller';
import { proofUpload } from '../middleware/proof-upload';
import { requireRole } from '../middleware/require-role';

export const paymentProofsRouter = Router();

paymentProofsRouter.post(
  '/api/me/maintenance-records/qr',
  requireRole(['OWNER', 'TENANT']),
  generatePaymentQrHandler,
);
paymentProofsRouter.post(
  '/api/me/payment-proofs',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  uploadPaymentProofHandler,
);
// Admin or the uploading resident, enforced in the service (getProofForViewing) since
// it depends on data (uploadedById), not just role — requireRole only narrows to "some
// authenticated user in this society," ownership is checked one layer down.
paymentProofsRouter.get(
  '/api/payment-proofs/:id/file',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getProofFileHandler,
);
