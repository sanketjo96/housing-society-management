import { Router } from 'express';
import {
  createComplaintHandler,
  deleteComplaintHandler,
  getComplaintFileHandler,
  listComplaintsHandler,
  unvoteComplaintHandler,
  updateComplaintHandler,
  upvoteComplaintHandler,
} from './resident-complaints.controller';
import { proofUpload } from '../../../middleware/proof-upload';
import { requireRole } from '../../../middleware/require-role';
import { verifyFileSignature } from '../../../middleware/verify-file-signature';

// Tenants have no access at all (docs/features/complaints/01-requirements.md
// Confirmed Product Decision #1). Logging/editing/deleting/upvoting are
// OWNER-only, but the list and image-view routes are also readable by
// ADMIN — admin needs to browse complaints and view their images to decide
// a status change (PATCH /api/admin/complaints/:id/status), without a
// second, duplicate listing endpoint.
const verifyComplaintImageSignature = verifyFileSignature(['image/jpeg', 'image/png', 'image/webp']);

export const residentComplaintsRouter = Router();

residentComplaintsRouter.get(
  '/api/complaints',
  requireRole(['OWNER', 'ADMIN']),
  listComplaintsHandler,
);
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
residentComplaintsRouter.post(
  '/api/complaints/:id/upvote',
  requireRole(['OWNER']),
  upvoteComplaintHandler,
);
residentComplaintsRouter.delete(
  '/api/complaints/:id/upvote',
  requireRole(['OWNER']),
  unvoteComplaintHandler,
);
residentComplaintsRouter.get(
  '/api/complaints/:id/image',
  requireRole(['OWNER', 'ADMIN']),
  getComplaintFileHandler,
);
