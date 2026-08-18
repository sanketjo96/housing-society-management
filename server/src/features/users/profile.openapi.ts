// OpenAPI docs for ./profile.route.ts — see auth/auth.openapi.ts's header comment for
// why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/me:
 *   patch:
 *     tags: [My Profile]
 *     summary: Update the caller's own name/phone/email
 *     description: Any authenticated role (ADMIN, OWNER, or TENANT) may call this for their own account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one field required.
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserPublic' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: email or phone already in use., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
