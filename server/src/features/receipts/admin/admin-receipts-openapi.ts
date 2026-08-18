// OpenAPI docs for ./admin-receipts-route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/receipts:
 *   get:
 *     tags: [Receipts (Admin)]
 *     summary: List every issued receipt for the society (Receipt Book)
 *     description: >
 *       A read-only register of all Receipt rows ever issued (i.e. every LedgerEntry
 *       that has been approved or manually marked paid), newest first. No pagination —
 *       the frontend Receipt Book page filters/searches the full result client-side,
 *       same convention as every other list endpoint in this app.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/Receipt' } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
