import { Router } from 'express';
import {
  getReceiptSignatureHandler,
  getSocietySettingsHandler,
  removeReceiptSignatureHandler,
  updateSocietySettingsHandler,
  uploadReceiptSignatureHandler,
} from '../controllers/society-settings.controller';
import { requireRole } from '../middleware/require-role';
import { signatureUpload } from '../middleware/signature-upload';

export const societySettingsRouter = Router();
societySettingsRouter.get('/api/admin/settings', requireRole(['ADMIN']), getSocietySettingsHandler);
societySettingsRouter.patch('/api/admin/settings', requireRole(['ADMIN']), updateSocietySettingsHandler);
societySettingsRouter.post(
  '/api/admin/settings/signature',
  requireRole(['ADMIN']),
  signatureUpload.single('file'),
  uploadReceiptSignatureHandler,
);
societySettingsRouter.delete(
  '/api/admin/settings/signature',
  requireRole(['ADMIN']),
  removeReceiptSignatureHandler,
);
societySettingsRouter.get(
  '/api/admin/settings/signature',
  requireRole(['ADMIN']),
  getReceiptSignatureHandler,
);
