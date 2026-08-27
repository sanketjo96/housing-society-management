import { Router } from 'express';
import {
  bulkImportSocietyLedgerEntriesHandler,
  getSocietyLedgerEntryFileHandler,
  inferSocietyLedgerBankReferenceHandler,
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
// Read-only OCR assist against a fresh upload, before the entry even exists —
// never writes anything, the admin still confirms/edits via the create form.
societyLedgerRouter.post(
  '/api/admin/society-ledger/ocr-extract',
  requireRole(['ADMIN']),
  proofUpload.single('file'),
  verifyFileSignature(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  inferSocietyLedgerBankReferenceHandler,
);
// Historical bulk import — no file involved, bulk-imported rows skip the
// mandatory-proof rule.
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
