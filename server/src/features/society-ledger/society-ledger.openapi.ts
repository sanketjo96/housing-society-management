// OpenAPI docs for society-ledger.route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/society-ledger:
 *   get:
 *     tags: [Manage Finance (Admin)]
 *     summary: List every society income/expense transaction, newest by transaction date
 *     description: >
 *       docs/manage-finance/. Entirely separate from resident-billing LedgerEntry —
 *       no flat, no payer, no settlement math.
 *     responses:
 *       200: { description: OK. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *   post:
 *     tags: [Manage Finance (Admin)]
 *     summary: Record a society income or expense transaction
 *     description: >
 *       Single-admin action, immutable once created — no approval workflow. A proof
 *       attachment is mandatory. bankReference is required unless paymentMethod is
 *       Cash. direction must match the chosen category's own direction.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [direction, categoryId, amount, transactionDate, paymentMethod, file]
 *             properties:
 *               direction: { type: string, enum: [INCOME, EXPENSE] }
 *               categoryId: { type: string }
 *               amount: { type: number }
 *               transactionDate: { type: string, format: date }
 *               paymentMethod: { type: string, enum: [CASH, BANK_TRANSFER, UPI, CHEQUE, OTHER] }
 *               bankReference: { type: string }
 *               note: { type: string }
 *               file: { type: string, format: binary }
 *     responses:
 *       201: { description: Created. }
 *       400: { description: Invalid input, non-positive amount, missing/inactive category, direction mismatch, missing bank reference, or missing file. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 * /api/admin/society-ledger/import:
 *   post:
 *     tags: [Manage Finance (Admin)]
 *     summary: Bulk-import historical society income/expense transactions via CSV
 *     description: >
 *       Phase E of docs/society-onboarding/. Reuses the same
 *       direction-matches-category and bank-reference-required-unless-cash checks
 *       recordSocietyLedgerEntry enforces, but skips the mandatory-proof-file rule
 *       (legacy rows have no scanned receipt) — each imported row's note is
 *       auto-appended with a marker flagging it as historical/unverified. Per-row
 *       errors are collected without aborting the batch.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [csv]
 *             properties:
 *               csv:
 *                 type: string
 *                 description: >
 *                   Columns: direction (INCOME|EXPENSE), categoryname, amount,
 *                   transactiondate, paymentmethod, bankreference (required unless
 *                   CASH), note (optional).
 *     responses:
 *       200: { description: "OK. Body has imported (count) and errors (row/message pairs)." }
 *       400: { description: Empty csv field. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 * /api/admin/society-ledger/{id}/file:
 *   get:
 *     tags: [Manage Finance (Admin)]
 *     summary: Download a society ledger entry's proof attachment
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: File stream. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *       404: { description: Not found, wrong society, or no file attached. }
 */
