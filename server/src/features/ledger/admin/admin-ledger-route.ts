import { Router } from 'express';
import {
  approveLedgerEntryHandler,
  inferBankReferenceHandler,
  listLedgerEntriesHandler,
  manualDepositHandler,
  previewReceiptHandler,
  rejectLedgerEntryHandler,
} from './admin-ledger-controller';
import { requireRole } from '../../../middleware/require-role';

export const adminLedgerRouter = Router();

adminLedgerRouter.get(
  '/api/admin/ledger-entries',
  requireRole(['ADMIN']),
  listLedgerEntriesHandler,
);
// Admin-only — part of the approval workflow, not a resident-facing view.
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
// Read-only OCR assist against the entry's own already-uploaded proof — never
// writes bankReference itself, the admin still confirms via /approve.
adminLedgerRouter.post(
  '/api/admin/ledger-entries/:id/infer-bank-reference',
  requireRole(['ADMIN']),
  inferBankReferenceHandler,
);
adminLedgerRouter.post(
  '/api/admin/ledger-entries/:id/reject',
  requireRole(['ADMIN']),
  rejectLedgerEntryHandler,
);
adminLedgerRouter.post(
  '/api/admin/ledger-entries/manual-deposit',
  requireRole(['ADMIN']),
  manualDepositHandler,
);
