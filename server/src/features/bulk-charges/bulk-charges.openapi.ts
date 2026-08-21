// OpenAPI docs for bulk-charges.route.ts — see auth/auth.openapi.ts's header comment
// for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/bulk-charges/import:
 *   post:
 *     tags: [Bulk Charges Import (Admin)]
 *     summary: Bulk-import one-time per-flat charges (Opening Balance arrears or Other Charges) via CSV
 *     description: >
 *       Phase C of docs/society-onboarding/. Each row is matched to an existing flat
 *       by wing+flatNumber and branches on `pool`: MAINTENANCE_OPENING_BALANCE
 *       creates a sentinel-period MaintenanceRecord that always settles before every
 *       real month; OTHER_CHARGE resolves an existing FeeType by name and reuses
 *       billOtherCharge's exact validation/creation contract. Per-row errors are
 *       collected without aborting the batch; re-importing the same Opening Balance
 *       row for a flat that already has one is a safe row-error, not a duplicate.
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
 *                   Columns: wing, flatnumber, pool (MAINTENANCE_OPENING_BALANCE |
 *                   OTHER_CHARGE), feetypename (required if pool=OTHER_CHARGE),
 *                   amount, note (optional).
 *     responses:
 *       200: { description: "OK. Body has imported (count) and errors (row/message pairs)." }
 *       400: { description: Empty csv field. }
 *       401: { description: Unauthenticated }
 *       403: { description: Caller is not an ADMIN. }
 */
