import { Router } from 'express';
import {
  cancelPaymentIntentHandler,
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
// Lower-level, one-shot primitive — kept even though the Pay UI now goes through
// the intent endpoints above.
residentLedgerRouter.post(
  '/api/me/ledger/deposits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  createDepositHandler,
);
// Admin or the entry's own payer, enforced in the service since it depends on
// data (payerId), not just role.
residentLedgerRouter.get(
  '/api/ledger-entries/:id/file',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getLedgerEntryFileHandler,
);
// Shared between the admin Payment Proofs queue and the resident Passbook.
residentLedgerRouter.get(
  '/api/ledger-entries/:id/receipt',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getIssuedReceiptHandler,
);
