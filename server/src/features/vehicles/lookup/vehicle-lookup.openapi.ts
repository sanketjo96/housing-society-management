// OpenAPI docs for ./vehicle-lookup.route.ts.
export {};

/**
 * @openapi
 * /api/vehicles/search:
 *   get:
 *     tags: [Vehicle Finder]
 *     summary: Look up which flat a registered vehicle belongs to
 *     description: >
 *       Any authenticated resident or admin. Plate matching is normalized
 *       (case/punctuation/whitespace-insensitive). A miss (unregistered or
 *       cross-society plate) returns { found: false }, never an error — and
 *       this endpoint writes nothing anywhere (no AuditLog), by design.
 *     parameters:
 *       - in: query
 *         name: plate
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK — either a match or a miss.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 found: { type: boolean }
 *                 wing: { type: string }
 *                 flatNumber: { type: string }
 *                 occupantName: { type: string }
 *                 occupantPhone: { type: string, nullable: true }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
