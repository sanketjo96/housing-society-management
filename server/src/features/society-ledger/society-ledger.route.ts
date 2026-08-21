import { Router } from 'express';
import {
  bulkImportSocietyLedgerEntriesHandler,
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
// Phase E of docs/society-onboarding/ — historical bulk import, no file involved
// (Confirmed Product Decision #4: bulk-imported rows skip the mandatory-proof rule).
societyLedgerRouter.post(
  '/api/admin/society-ledger/import',
  requireRole(['ADMIN']),
  bulkImportSocietyLedgerEntriesHandler,
);
societyLedgerRouter.get(
  '/api/admin/society-ledger/:id/file',
  requireRole(['ADMIN']),
  getSocietyLedgerEntryFileHandler,
);
