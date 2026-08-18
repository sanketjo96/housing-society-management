// OpenAPI docs for ./resident-flats-route.ts — see auth/auth.openapi.ts's header comment for why
// these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/me/flat:
 *   get:
 *     tags: [My Flat]
 *     summary: Get the flat the caller owns or currently occupies
 *     description: For an OWNER, the flat they own. For a TENANT, the flat they currently occupy.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   put:
 *     tags: [My Flat]
 *     summary: Update owner contact details and/or occupancy/tenant, in one combined save
 *     description: >
 *       OWNER only. wing/flatNumber/baseRate are never accepted — still admin-set and
 *       read-only from this side. Reuses the same find-or-create-tenant-inline
 *       mechanism as the admin PATCH /api/admin/flats/{id}.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateFlatRequest' }
 *     responses:
 *       200:
 *         description: Updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an OWNER., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Owner email already in use, or belongs to a conflicting role., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/me/flat/tenant:
 *   put:
 *     tags: [My Flat]
 *     summary: Create or update the tenant currently occupying the caller's flat
 *     description: >
 *       OWNER only. Lower-level alternative to PUT /api/me/flat — kept for a
 *       tenant-only save. Unlike the admin id-based assignTenant, this updates the
 *       existing tenant's details in place rather than rejecting when one already
 *       exists. A newly-created tenant account gets a random unusable password and a
 *       password-reset email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *               email: { type: string, format: email }
 *               effectiveFrom: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Upserted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an OWNER., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: email already in use., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   delete:
 *     tags: [My Flat]
 *     summary: Remove the tenant currently occupying the caller's flat
 *     description: OWNER only. Closes the open OccupancyChange row and reverts to owner-occupied.
 *     responses:
 *       200:
 *         description: Removed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an OWNER., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with the caller's account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Flat has no current tenant to remove., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
