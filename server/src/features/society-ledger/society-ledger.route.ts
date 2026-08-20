import { Router } from 'express';
import {
  getSocietyLedgerEntryFileHandler,
  listSocietyLedgerEntriesHandler,
  recordSocietyLedgerEntryHandler,
} from './society-ledger.controller';
import { requireRole } from '../../middleware/require-role';
import { proofUpload } from '../../middleware/proof-upload';
import { verifyFileSignature } from '../../middleware/verify-file-signature';

export const societyLedgerRouter = Router();

societyLedgerRouter.get('/api/admin/society-ledger', requireRole(['ADMIN']), listSocietyLedgerEntriesHandler);
societyLedgerRouter.post(
  '/api/admin/society-ledger',
  requireRole(['ADMIN']),
  proofUpload.single('file'),
  verifyFileSignature(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  recordSocietyLedgerEntryHandler,
);
societyLedgerRouter.get(
  '/api/admin/society-ledger/:id/file',
  requireRole(['ADMIN']),
  getSocietyLedgerEntryFileHandler,
);
