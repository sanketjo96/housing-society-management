import { Router } from 'express';
import {
  cancelPaymentIntentHandler,
  createCreditHandler,
  createDepositHandler,
  createPaymentIntentHandler,
  getIssuedReceiptHandler,
  getLedgerEntryFileHandler,
  getMyBalancesHandler,
  getMyLedgerHandler,
  getPaymentIntentHandler,
  submitPaymentIntentHandler,
} from './resident-ledger-controller';
import { proofUpload } from '../../../middleware/proof-upload';
import { requireRole } from '../../../middleware/require-role';
import { verifyFileSignature } from '../../../middleware/verify-file-signature';

const verifyProofSignature = verifyFileSignature([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const residentLedgerRouter = Router();

residentLedgerRouter.get('/api/me/ledger', requireRole(['OWNER', 'TENANT']), getMyLedgerHandler);
// docs/other-charges/ — Dashboard's 4 summary cards (Maintenance/Other Outstanding
// + Total Outstanding) in one call.
residentLedgerRouter.get('/api/me/balances', requireRole(['OWNER', 'TENANT']), getMyBalancesHandler);
residentLedgerRouter.get(
  '/api/me/ledger/deposits/intent',
  requireRole(['OWNER', 'TENANT']),
  getPaymentIntentHandler,
);
residentLedgerRouter.post(
  '/api/me/ledger/deposits/intent',
  requireRole(['OWNER', 'TENANT']),
  createPaymentIntentHandler,
);
residentLedgerRouter.post(
  '/api/me/ledger/deposits/intent/submit',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  submitPaymentIntentHandler,
);
residentLedgerRouter.delete(
  '/api/me/ledger/deposits/intent',
  requireRole(['OWNER', 'TENANT']),
  cancelPaymentIntentHandler,
);
// Lower-level, one-shot primitive — kept unremoved even though the resident-facing
// Pay UI now goes through the intent endpoints above (same precedent as CLAUDE.md's
// flats/tenant addendum: a lower-level endpoint stays available even once the
// primary UI path moves off it).
residentLedgerRouter.post(
  '/api/me/ledger/deposits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  createDepositHandler,
);
// Credit re-introduced 2026-08-07 — resident-submitted, admin-approved (same
// PENDING/APPROVED/REJECTED flow as a Deposit). Proof upload is required here (unlike
// a Deposit's optional screenshot) — the committee's only independent evidence for an
// arbitrary discretionary adjustment, alongside the also-required note.
residentLedgerRouter.post(
  '/api/me/ledger/credits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  createCreditHandler,
);
// Admin or the entry's own payer, enforced in the service (getLedgerEntryForViewing)
// since it depends on data (payerId), not just role — same pattern as the pre-pivot
// proof file endpoint.
residentLedgerRouter.get(
  '/api/ledger-entries/:id/file',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getLedgerEntryFileHandler,
);
// Shared between the admin Payment Proofs queue and the resident Passbook — admin
// or the entry's own payer, enforced in the service (getIssuedReceiptForViewing),
// same pattern as the file endpoint immediately above.
residentLedgerRouter.get(
  '/api/ledger-entries/:id/receipt',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getIssuedReceiptHandler,
);
