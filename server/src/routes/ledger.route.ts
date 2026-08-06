import { Router } from 'express';
import {
  createCreditHandler,
  createDepositHandler,
  generateDepositQrHandler,
  getLedgerEntryFileHandler,
  getMyLedgerHandler,
} from '../controllers/ledger.controller';
import { proofUpload } from '../middleware/proof-upload';
import { requireRole } from '../middleware/require-role';

export const ledgerRouter = Router();

ledgerRouter.get('/api/me/ledger', requireRole(['OWNER', 'TENANT']), getMyLedgerHandler);
ledgerRouter.post('/api/me/ledger/deposits/qr', requireRole(['OWNER', 'TENANT']), generateDepositQrHandler);
ledgerRouter.post(
  '/api/me/ledger/deposits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  createDepositHandler,
);
ledgerRouter.post(
  '/api/me/ledger/credits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  createCreditHandler,
);
// Admin or the entry's own payer, enforced in the service (getLedgerEntryForViewing)
// since it depends on data (payerId), not just role — same pattern as the pre-pivot
// proof file endpoint.
ledgerRouter.get(
  '/api/ledger-entries/:id/file',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getLedgerEntryFileHandler,
);
