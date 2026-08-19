// OpenAPI docs for fee-types.route.ts — see auth/auth.openapi.ts's header comment
// for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/fee-types:
 *   get:
 *     tags: [Fee Types (Admin)]
 *     summary: List the society's Other-Charges fee-type catalog
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema: { type: boolean }
 *         description: Include deactivated fee types (default false — active only).
 *     responses:
 *       200: { description: OK. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *   post:
 *     tags: [Fee Types (Admin)]
 *     summary: Create a fee type
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       201: { description: Created. }
 *       400: { description: Invalid input }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *       409: { description: A fee type with this name already exists for this society. }
 * /api/admin/fee-types/{id}:
 *   patch:
 *     tags: [Fee Types (Admin)]
 *     summary: Update a fee type (rename, edit description, or activate/deactivate)
 *     description: >
 *       Every field optional. isActive is the only removal mechanism — a fee type
 *       is never hard-deleted, since a billed OtherCharge must keep a valid, named
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
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated. }
 *       400: { description: Invalid input }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *       404: { description: Fee type not found. }
 *       409: { description: A fee type with this name already exists for this society. }
 */
