// OpenAPI docs for ./admin-complaints.route.ts.
export {};

/**
 * @openapi
 * /api/admin/complaints/{id}/status:
 *   patch:
 *     tags: [Complaints]
 *     summary: Change a complaint's status
 *     description: >
 *       ADMIN only. Any status to any other status, at any time — no
 *       restricted transitions. Admin never edits or deletes complaint
 *       content; Rejected is the only moderation tool for bad/duplicate
 *       complaints.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, REJECTED] }
 *     responses:
 *       200: { description: Updated. }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Forbidden — admin only, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Complaint not found., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
