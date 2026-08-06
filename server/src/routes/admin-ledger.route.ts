import { Router } from 'express';
import {
  approveLedgerEntryHandler,
  listLedgerEntriesHandler,
  manualDepositHandler,
  rejectLedgerEntryHandler,
} from '../controllers/admin-ledger.controller';
import { requireRole } from '../middleware/require-role';

export const adminLedgerRouter = Router();

adminLedgerRouter.get('/api/admin/ledger-entries', requireRole(['ADMIN']), listLedgerEntriesHandler);
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
