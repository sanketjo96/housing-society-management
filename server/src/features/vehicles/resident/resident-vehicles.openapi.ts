// OpenAPI docs for ./resident-vehicles.route.ts.
export {};

/**
 * @openapi
 * /api/me/vehicles:
 *   get:
 *     tags: [Vehicle Finder]
 *     summary: List the caller's own registered vehicles
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   plateNumber: { type: string }
 *                   type: { type: string, enum: [TWO_WHEELER, FOUR_WHEELER] }
 *                   createdAt: { type: string, format: date-time }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   post:
 *     tags: [Vehicle Finder]
 *     summary: Register a vehicle for the caller
 *     description: >
 *       OWNER or TENANT. Plate numbers are normalized (uppercased, punctuation/
 *       whitespace stripped) before storage and must be unique within the society.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plateNumber, type]
 *             properties:
 *               plateNumber: { type: string }
 *               type: { type: string, enum: [TWO_WHEELER, FOUR_WHEELER] }
 *     responses:
 *       201:
 *         description: Registered.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 plateNumber: { type: string }
 *                 type: { type: string, enum: [TWO_WHEELER, FOUR_WHEELER] }
 *                 createdAt: { type: string, format: date-time }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Plate already registered in this society., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/me/vehicles/{id}:
 *   delete:
 *     tags: [Vehicle Finder]
 *     summary: Delete one of the caller's own vehicles
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Vehicle not found, or belongs to another resident., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
