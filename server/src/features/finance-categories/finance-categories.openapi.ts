// OpenAPI docs for finance-categories.route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/finance-categories:
 *   get:
 *     tags: [Finance Categories (Admin)]
 *     summary: List the society's income/expense category catalog (docs/manage-finance/)
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema: { type: boolean }
 *         description: Include deactivated categories (default false — active only).
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [INCOME, EXPENSE] }
 *         description: Filter to only categories of this direction.
 *     responses:
 *       200: { description: OK. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *   post:
 *     tags: [Finance Categories (Admin)]
 *     summary: Create an income or expense category
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, direction]
 *             properties:
 *               name: { type: string }
 *               direction: { type: string, enum: [INCOME, EXPENSE] }
 *               description: { type: string }
 *     responses:
 *       201: { description: Created. }
 *       400: { description: Invalid input }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *       409: { description: A category with this name already exists for this society. }
 * /api/admin/finance-categories/{id}:
 *   patch:
 *     tags: [Finance Categories (Admin)]
 *     summary: Activate or deactivate a finance category
 *     description: >
 *       isActive is the only removal mechanism — a category is never hard-deleted or
 *       renamed in v1, since a recorded SocietyLedgerEntry must keep a valid, named
 *       reference forever.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated. }
 *       400: { description: Invalid input }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *       404: { description: Finance category not found. }
 */
