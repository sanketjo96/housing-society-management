// OpenAPI docs for fee-types.route.ts. Displayed as "Custom Fee(s)" — route
// paths and the underlying FeeType model keep their original name.
export {};

/**
 * @openapi
 * /api/admin/fee-types:
 *   get:
 *     tags: [Custom Fees (Admin)]
 *     summary: List the society's Other-Charges custom-fee catalog
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema: { type: boolean }
 *         description: Include deactivated custom fees (default false — active only).
 *     responses:
 *       200: { description: OK. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 *   post:
 *     tags: [Custom Fees (Admin)]
 *     summary: Create a custom fee
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
 *       409: { description: A custom fee with this name already exists for this society. }
 * /api/admin/fee-types/{id}:
 *   patch:
 *     tags: [Custom Fees (Admin)]
 *     summary: Update a custom fee (rename, edit description, or activate/deactivate)
 *     description: >
 *       Every field optional. isActive is the only removal mechanism — a custom fee
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
 *       404: { description: Custom fee not found. }
 *       409: { description: A custom fee with this name already exists for this society. }
 */
