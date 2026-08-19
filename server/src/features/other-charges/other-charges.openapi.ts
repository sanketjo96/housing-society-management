// OpenAPI docs for other-charges.route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/other-charges:
 *   get:
 *     tags: [Other Charges (Admin)]
 *     summary: List every billed Other Charge for the society, newest first
 *     description: >
 *       Each row's settlementStatus/settledAmount is derived fresh (FIFO fill
 *       against that flat's own Other-Charges pool) — never mixed with maintenance
 *       dues. See docs/other-charges/.
 *     responses:
 *       200: { description: OK. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *   post:
 *     tags: [Other Charges (Admin)]
 *     summary: Bill an ad-hoc charge to a flat's owner
 *     description: >
 *       One flat at a time — no bulk billing. payerId is always resolved to the
 *       flat's owner server-side, never client-suppliable. No Receipt is issued for
 *       billing (Receipts are money-received-only).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [flatId, feeTypeId, amount]
 *             properties:
 *               flatId: { type: string }
 *               feeTypeId: { type: string }
 *               amount: { type: number }
 *               note: { type: string }
 *     responses:
 *       201: { description: Created. }
 *       400: { description: Invalid input, non-positive amount, or an inactive/missing fee type. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *       404: { description: Flat not found. }
 */
