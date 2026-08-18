// OpenAPI docs for ./admin-flats-route.ts — see auth/auth.openapi.ts's header comment for why
// these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/flats:
 *   get:
 *     tags: [Flats (Admin)]
 *     summary: List every flat in the caller's society
 *     description: Includes owner/current-tenant contact summaries in one query — no N+1 follow-up requests per row.
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/Flat' } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   post:
 *     tags: [Flats (Admin)]
 *     summary: Onboard a new flat
 *     description: >
 *       One atomic action: find-or-creates the owner's account by email (and the
 *       tenant's, if occupancy is 'tenant'), creates the Flat, and opens an
 *       OccupancyChange if tenant-occupied. A newly-created account gets a random
 *       unusable password and a password-reset email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateFlatRequest' }
 *     responses:
 *       201:
 *         description: Created.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: 'wing+flatNumber already exists, an email is already in use, or belongs to a conflicting role.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/flats/import:
 *   post:
 *     tags: [Flats (Admin)]
 *     summary: Bulk-onboard flats from CSV
 *     description: >
 *       Column-name-based (not fixed-order): wing, flatNumber, ownerName, ownerPhone,
 *       ownerEmail required; occupancy, tenantName, tenantPhone, tenantEmail,
 *       effectiveFrom optional. Every row always takes the society's configured
 *       default base rate. Per-row failures are collected, not fatal to the batch.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [csv]
 *             properties:
 *               csv: { type: string, description: Raw CSV text, header row required. }
 *     responses:
 *       200:
 *         description: Always 200 — check `errors` for any per-row failures.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 created: { type: array, items: { $ref: '#/components/schemas/Flat' } }
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       row: { type: integer }
 *                       message: { type: string }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/flats/{id}:
 *   patch:
 *     tags: [Flats (Admin)]
 *     summary: Update a flat's rate, owner contact, or occupancy/tenant
 *     description: wing and flatNumber are never editable — set once at onboarding.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
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
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: 'No such flat, or it belongs to a different society.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Owner email already in use, or belongs to a conflicting role., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/flats/{id}/tenant:
 *   post:
 *     tags: [Flats (Admin)]
 *     summary: Assign an existing tenant account to a flat, by id
 *     description: >
 *       Lower-level alternative to PATCH /api/admin/flats/{id}'s contact-field
 *       find-or-create flow — links an already-known TENANT account without
 *       re-typing its details. Rejects if the flat already has a current tenant;
 *       call DELETE first.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId]
 *             properties:
 *               tenantId: { type: string }
 *     responses:
 *       200:
 *         description: Assigned.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       400: { description: 'tenantId does not reference an existing TENANT in this society.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: 'No such flat, or it belongs to a different society.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Flat already has a current tenant., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   delete:
 *     tags: [Flats (Admin)]
 *     summary: Remove a flat's current tenant, by id
 *     description: Closes the open OccupancyChange row and reverts the flat to owner-occupied.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Removed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Flat' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: 'No such flat, or it belongs to a different society.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Flat has no current tenant to remove., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
