import { Router } from 'express';
import {
  getCommitteeSignatureHandler,
  getSocietySettingsHandler,
  removeCommitteeSignatureHandler,
  updateSocietySettingsHandler,
  uploadCommitteeSignatureHandler,
} from '../controllers/society-settings.controller';
import { requireRole } from '../middleware/require-role';
import { signatureUpload } from '../middleware/signature-upload';
import { verifyFileSignature } from '../middleware/verify-file-signature';

const verifySignatureFileSignature = verifyFileSignature(['image/png', 'image/jpeg', 'image/webp']);

export const societySettingsRouter = Router();
societySettingsRouter.get('/api/admin/settings', requireRole(['ADMIN']), getSocietySettingsHandler);
societySettingsRouter.patch('/api/admin/settings', requireRole(['ADMIN']), updateSocietySettingsHandler);
// :role is 'chairman' | 'secretary' | 'treasurer' — see the controller's
// parseCommitteeRoleParam. Treasurer's signature is the same file a receipt's
// letterhead uses (society-settings.service.ts's committeeSignatureUpdateData).
societySettingsRouter.post(
  '/api/admin/settings/committee/:role/signature',
  requireRole(['ADMIN']),
  signatureUpload.single('file'),
  verifySignatureFileSignature,
  uploadCommitteeSignatureHandler,
);
societySettingsRouter.delete(
  '/api/admin/settings/committee/:role/signature',
  requireRole(['ADMIN']),
  removeCommitteeSignatureHandler,
);
societySettingsRouter.get(
  '/api/admin/settings/committee/:role/signature',
  requireRole(['ADMIN']),
  getCommitteeSignatureHandler,
);
