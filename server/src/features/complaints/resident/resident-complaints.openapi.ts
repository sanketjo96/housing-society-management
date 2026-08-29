// OpenAPI docs for ./resident-complaints.route.ts.
export {};

/**
 * @openapi
 * /api/complaints:
 *   get:
 *     tags: [Complaints]
 *     summary: List every complaint in the society, ranked by upvote count
 *     description: >
 *       OWNER or ADMIN. Society-wide, shared visibility — not filtered to
 *       the caller's own complaints. Sorted by upvote count descending,
 *       then most recent first.
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
 *                   title: { type: string }
 *                   possibleSolution: { type: string }
 *                   priority: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *                   status: { type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, REJECTED] }
 *                   createdAt: { type: string, format: date-time }
 *                   hasImage: { type: boolean }
 *                   upvoteCount: { type: integer }
 *                   owner: { type: object, properties: { id: { type: string }, name: { type: string } } }
 *                   flat: { type: object, properties: { wing: { type: string }, flatNumber: { type: string } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   post:
 *     tags: [Complaints]
 *     summary: Log a complaint
 *     description: >
 *       OWNER only. Tied automatically to the caller and their own flat.
 *       Accepts an optional image (JPEG/PNG/WEBP).
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, possibleSolution, priority]
 *             properties:
 *               title: { type: string }
 *               possibleSolution: { type: string }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *               file: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Logged.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 title: { type: string }
 *                 possibleSolution: { type: string }
 *                 priority: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *                 status: { type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, REJECTED] }
 *                 createdAt: { type: string, format: date-time }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No flat associated with your account., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/complaints/{id}:
 *   patch:
 *     tags: [Complaints]
 *     summary: Edit a complaint the caller logged
 *     description: >
 *       OWNER only, and only the complaint's own owner. Allowed only while
 *       status is Open and the upvote count is zero — a live check, not a
 *       one-way lock. Once locked, this returns 409 even for the owner who
 *       logged it; if the condition later reverts (upvote removed, or
 *       admin reverts status to Open), edit access returns automatically.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, possibleSolution, priority]
 *             properties:
 *               title: { type: string }
 *               possibleSolution: { type: string }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Updated. }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Complaint not found, or belongs to another owner., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Locked — no longer Open with zero upvotes., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   delete:
 *     tags: [Complaints]
 *     summary: Delete a complaint the caller logged
 *     description: Same lock rule as PATCH — Open with zero upvotes only.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Complaint not found, or belongs to another owner., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Locked — no longer Open with zero upvotes., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/complaints/{id}/upvote:
 *   post:
 *     tags: [Complaints]
 *     summary: Upvote a complaint
 *     description: >
 *       OWNER only. Any owner may upvote any complaint, including their
 *       own. Idempotent — upvoting twice is a silent no-op, not an error.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Upvoted (or already was). }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Complaint not found., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   delete:
 *     tags: [Complaints]
 *     summary: Remove the caller's own upvote from a complaint
 *     description: Idempotent — a no-op if no upvote existed.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Un-upvoted (or already wasn't). }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/complaints/{id}/image:
 *   get:
 *     tags: [Complaints]
 *     summary: Fetch a complaint's optional image
 *     description: OWNER or ADMIN. Authenticated, never a public URL.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The image file. }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — tenants have no access, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Complaint or image not found., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
