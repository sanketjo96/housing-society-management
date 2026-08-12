import { Router } from 'express';
import {
  approveLedgerEntryHandler,
  listLedgerEntriesHandler,
  manualDepositHandler,
  previewReceiptHandler,
  rejectLedgerEntryHandler,
} from '../controllers/admin-ledger.controller';
import { requireRole } from '../middleware/require-role';

export const adminLedgerRouter = Router();

adminLedgerRouter.get('/api/admin/ledger-entries', requireRole(['ADMIN']), listLedgerEntriesHandler);
// Admin-only — the receipt preview is part of the approval workflow itself, not a
// resident-facing view (unlike the issued-receipt download, GET
// /api/ledger-entries/:id/receipt in ledger.route.ts, which is shared).
adminLedgerRouter.get(
  '/api/admin/ledger-entries/:id/receipt-preview',
  requireRole(['ADMIN']),
  previewReceiptHandler,
);
adminLedgerRouter.post(
  '/api/admin/ledger-entries/:id/approve',
  requireRole(['ADMIN']),
  approveLedgerEntryHandler,
);
adminLedgerRouter.post('/api/admin/ledger-entries/:id/reject', requireRole(['ADMIN']), rejectLedgerEntryHandler);
adminLedgerRouter.post(
  '/api/admin/ledger-entries/manual-deposit',
  requireRole(['ADMIN']),
  manualDepositHandler,
);
