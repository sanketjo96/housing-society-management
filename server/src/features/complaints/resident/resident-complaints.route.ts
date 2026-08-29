import { Router } from 'express';
import {
  createComplaintHandler,
  deleteComplaintHandler,
  getComplaintFileHandler,
  listComplaintsHandler,
  updateComplaintHandler,
} from './resident-complaints.controller';
import { proofUpload } from '../../../middleware/proof-upload';
import { requireRole } from '../../../middleware/require-role';
import { verifyFileSignature } from '../../../middleware/verify-file-signature';

// Tenants have no access at all — every route is OWNER-only
// (docs/features/complaints/01-requirements.md Confirmed Product Decision #1).
const verifyComplaintImageSignature = verifyFileSignature(['image/jpeg', 'image/png', 'image/webp']);

export const residentComplaintsRouter = Router();

residentComplaintsRouter.get('/api/complaints', requireRole(['OWNER']), listComplaintsHandler);
residentComplaintsRouter.post(
  '/api/complaints',
  requireRole(['OWNER']),
  proofUpload.single('file'),
  verifyComplaintImageSignature,
  createComplaintHandler,
);
residentComplaintsRouter.patch(
  '/api/complaints/:id',
  requireRole(['OWNER']),
  proofUpload.single('file'),
  verifyComplaintImageSignature,
  updateComplaintHandler,
);
residentComplaintsRouter.delete(
  '/api/complaints/:id',
  requireRole(['OWNER']),
  deleteComplaintHandler,
);
residentComplaintsRouter.get(
  '/api/complaints/:id/image',
  requireRole(['OWNER']),
  getComplaintFileHandler,
);
