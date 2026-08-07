import { Router } from 'express';
import {
  cancelPaymentIntentHandler,
  createCreditHandler,
  createDepositHandler,
  createPaymentIntentHandler,
  getLedgerEntryFileHandler,
  getMyLedgerHandler,
  getPaymentIntentHandler,
  submitPaymentIntentHandler,
} from '../controllers/ledger.controller';
import { proofUpload } from '../middleware/proof-upload';
import { requireRole } from '../middleware/require-role';

export const ledgerRouter = Router();

ledgerRouter.get('/api/me/ledger', requireRole(['OWNER', 'TENANT']), getMyLedgerHandler);
ledgerRouter.get('/api/me/ledger/deposits/intent', requireRole(['OWNER', 'TENANT']), getPaymentIntentHandler);
ledgerRouter.post('/api/me/ledger/deposits/intent', requireRole(['OWNER', 'TENANT']), createPaymentIntentHandler);
ledgerRouter.post(
  '/api/me/ledger/deposits/intent/submit',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  submitPaymentIntentHandler,
);
ledgerRouter.delete('/api/me/ledger/deposits/intent', requireRole(['OWNER', 'TENANT']), cancelPaymentIntentHandler);
// Lower-level, one-shot primitive — kept unremoved even though the resident-facing
// Pay UI now goes through the intent endpoints above (same precedent as CLAUDE.md's
// flats/tenant addendum: a lower-level endpoint stays available even once the
// primary UI path moves off it).
ledgerRouter.post(
  '/api/me/ledger/deposits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  createDepositHandler,
);
// Credit re-introduced 2026-08-07 — resident-submitted, admin-approved (same
// PENDING/APPROVED/REJECTED flow as a Deposit). Proof upload is required here (unlike
// a Deposit's optional screenshot) — the committee's only independent evidence for an
// arbitrary discretionary adjustment, alongside the also-required note.
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
