// OpenAPI docs for admin-ledger.route.ts — see auth/auth.openapi.ts's header comment
// for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/ledger-entries:
 *   get:
 *     tags: [Ledger (Admin)]
 *     summary: List ledger entries (Deposits/Credits) for the society
 *     parameters:
 *       - name: status
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED] }
 *       - name: type
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [DEPOSIT, CREDIT] }
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/LedgerEntry' } }
 *       400: { description: Invalid query, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/ledger-entries/{id}/receipt-preview:
 *   get:
 *     tags: [Ledger (Admin)]
 *     summary: Preview the exact receipt PDF that approving this entry would issue
 *     description: >
 *       Renders via the same buildReceiptData/renderReceiptPdf path the real approval
 *       uses — byte-for-byte identical to the eventually-issued receipt. Read-only: no
 *       storage write, no Receipt row created, entry stays PENDING.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The preview PDF. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No such entry., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Entry has already been reviewed (not PENDING)., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/ledger-entries/{id}/approve:
 *   post:
 *     tags: [Ledger (Admin)]
 *     summary: Approve a pending Deposit or Credit
 *     description: >
 *       Settles the entry (it now counts toward the flat's balance) and issues its
 *       receipt in the same step — the receipt is created here, never re-rendered later.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Approved.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LedgerEntry' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No such entry., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Entry has already been reviewed (not PENDING)., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/ledger-entries/{id}/reject:
 *   post:
 *     tags: [Ledger (Admin)]
 *     summary: Reject a pending Deposit or Credit
 *     description: The resident is notified, with the optional reason, and may re-submit.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Rejected.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LedgerEntry' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No such entry., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Entry has already been reviewed (not PENDING)., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/ledger-entries/manual-deposit:
 *   post:
 *     tags: [Ledger (Admin)]
 *     summary: Record a cash/bank-transfer payment as an already-approved Deposit
 *     description: >
 *       Fallback for payments collected outside the UPI/QR flow. Creates the Deposit
 *       already APPROVED and issues its receipt synchronously — logged distinctly in
 *       the audit trail (MANUAL_MARK_PAID) from a normal QR-flow approval.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [flatId, amount]
 *             properties:
 *               flatId: { type: string }
 *               amount: { type: number, exclusiveMinimum: 0 }
 *     responses:
 *       201:
 *         description: Created, status APPROVED.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LedgerEntry' }
 *       400: { description: Invalid amount., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No such flat., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
