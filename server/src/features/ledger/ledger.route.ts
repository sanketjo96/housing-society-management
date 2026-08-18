import { Router } from 'express';
import {
  cancelPaymentIntentHandler,
  createCreditHandler,
  createDepositHandler,
  createPaymentIntentHandler,
  getIssuedReceiptHandler,
  getLedgerEntryFileHandler,
  getMyLedgerHandler,
  getPaymentIntentHandler,
  submitPaymentIntentHandler,
} from './ledger.controller';
import { proofUpload } from '../../middleware/proof-upload';
import { requireRole } from '../../middleware/require-role';
import { verifyFileSignature } from '../../middleware/verify-file-signature';

const verifyProofSignature = verifyFileSignature([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const ledgerRouter = Router();

/**
 * @openapi
 * /api/me/ledger:
 *   get:
 *     tags: [My Ledger]
 *     summary: Get the caller's Passbook — Outstanding, Available Credit, and every ledger row
 *     parameters:
 *       - name: year
 *         in: query
 *         required: false
 *         schema: { type: integer }
 *         description: Filter maintenance records/ledger rows to a specific year.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 outstanding: { type: string }
 *                 availableCredit: { type: string }
 *                 maintenanceRecords: { type: array, items: { $ref: '#/components/schemas/MaintenanceRecord' } }
 *                 ledgerEntries: { type: array, items: { $ref: '#/components/schemas/LedgerEntry' } }
 *       400: { description: Invalid query, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.get('/api/me/ledger', requireRole(['OWNER', 'TENANT']), getMyLedgerHandler);

/**
 * @openapi
 * /api/me/ledger/deposits/intent:
 *   get:
 *     tags: [My Ledger]
 *     summary: Get the caller's currently open payment intent, if any
 *     responses:
 *       200:
 *         description: OK — `intent` is null if none is open.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intent:
 *                   allOf: [{ $ref: '#/components/schemas/PaymentIntent' }]
 *                   nullable: true
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Society has no UPI VPA or complete bank details configured., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   post:
 *     tags: [My Ledger]
 *     summary: Lock a payment intent for a given amount
 *     description: >
 *       Amount must be > 0 and <= current Outstanding. Locks in whichever payment
 *       method the society has configured (UPI takes precedence over bank transfer).
 *       Replaces any existing open intent for this flat.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, exclusiveMinimum: 0 }
 *     responses:
 *       201:
 *         description: Locked.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intent: { $ref: '#/components/schemas/PaymentIntent' }
 *       400: { description: 'Invalid amount (must be > 0 and <= Outstanding).', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Society has no UPI VPA or complete bank details configured., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   delete:
 *     tags: [My Ledger]
 *     summary: Cancel the caller's currently open payment intent
 *     responses:
 *       204: { description: Cancelled (or none was open). }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.get(
  '/api/me/ledger/deposits/intent',
  requireRole(['OWNER', 'TENANT']),
  getPaymentIntentHandler,
);
ledgerRouter.post(
  '/api/me/ledger/deposits/intent',
  requireRole(['OWNER', 'TENANT']),
  createPaymentIntentHandler,
);

/**
 * @openapi
 * /api/me/ledger/deposits/intent/submit:
 *   post:
 *     tags: [My Ledger]
 *     summary: Attach a payment screenshot and finalize the open intent into a pending Deposit
 *     description: The screenshot is required at this step (unlike the lower-level POST /api/me/ledger/deposits).
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Deposit created, status PENDING.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LedgerEntry' }
 *       400: { description: Missing/invalid file, or its content doesn't match an allowed type., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account, or no open intent to submit., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.post(
  '/api/me/ledger/deposits/intent/submit',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  submitPaymentIntentHandler,
);
ledgerRouter.delete(
  '/api/me/ledger/deposits/intent',
  requireRole(['OWNER', 'TENANT']),
  cancelPaymentIntentHandler,
);

/**
 * @openapi
 * /api/me/ledger/deposits:
 *   post:
 *     tags: [My Ledger]
 *     summary: Create a Deposit directly, without the payment-intent lock/QR flow
 *     description: >
 *       Lower-level, one-shot primitive — kept available even though the resident-facing
 *       Pay UI now goes through the intent endpoints above. Screenshot is optional here.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, exclusiveMinimum: 0 }
 *               file: { type: string, format: binary, description: Optional payment screenshot. }
 *     responses:
 *       201:
 *         description: Created, status PENDING.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LedgerEntry' }
 *       400: { description: 'Invalid amount (must be > 0 and <= Outstanding), or file content mismatch.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.post(
  '/api/me/ledger/deposits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  createDepositHandler,
);

/**
 * @openapi
 * /api/me/ledger/credits:
 *   post:
 *     tags: [My Ledger]
 *     summary: Request a committee-approved Credit against the caller's balance
 *     description: >
 *       Unlike a Deposit, amount has no upper bound (only amount > 0 is checked) — a
 *       resident can request more credit than they currently owe. note and a proof
 *       attachment are both required (the one asymmetry with Deposit, whose proof is
 *       optional). Zero balance effect until an admin approves it.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [amount, note, file]
 *             properties:
 *               amount: { type: number, exclusiveMinimum: 0 }
 *               note: { type: string, minLength: 1, description: Why this adjustment is being requested. }
 *               file: { type: string, format: binary, description: Required proof — receipt, invoice, or photo. }
 *     responses:
 *       201:
 *         description: Created, status PENDING.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LedgerEntry' }
 *       400: { description: Invalid amount/note, missing proof, or file content mismatch., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.post(
  '/api/me/ledger/credits',
  requireRole(['OWNER', 'TENANT']),
  proofUpload.single('file'),
  verifyProofSignature,
  createCreditHandler,
);

/**
 * @openapi
 * /api/ledger-entries/{id}/file:
 *   get:
 *     tags: [My Ledger]
 *     summary: Download a ledger entry's proof file (screenshot/receipt/invoice)
 *     description: Admin, or the entry's own payer (owner or tenant, symmetric).
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The raw file, streamed with its stored Content-Type. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is neither an admin nor this entry's payer., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No such entry, or it has no proof file., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.get(
  '/api/ledger-entries/:id/file',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getLedgerEntryFileHandler,
);

/**
 * @openapi
 * /api/ledger-entries/{id}/receipt:
 *   get:
 *     tags: [My Ledger]
 *     summary: Download the receipt PDF issued for an approved ledger entry
 *     description: >
 *       Admin, or the entry's own payer (owner or tenant, symmetric). A legacy entry
 *       approved before receipts existed has none — 404, never lazily fabricated.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The receipt PDF. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is neither an admin nor this entry's payer., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No such entry, or no receipt was issued for it., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
ledgerRouter.get(
  '/api/ledger-entries/:id/receipt',
  requireRole(['ADMIN', 'OWNER', 'TENANT']),
  getIssuedReceiptHandler,
);
