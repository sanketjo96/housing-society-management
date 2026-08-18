// OpenAPI docs for society-settings.route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/admin/settings:
 *   get:
 *     tags: [Society Settings (Admin)]
 *     summary: Get the society's billing/payment/receipt configuration
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SocietySettings' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   patch:
 *     tags: [Society Settings (Admin)]
 *     summary: Update the society's billing/payment/receipt configuration
 *     description: >
 *       Every field optional (partial update). upiVpa/bankAccountNumber/bankIfsc/the
 *       receipt text fields accept '' to explicitly clear them back to null. Bank
 *       account number and IFSC are validated as a pair against the *merged* final
 *       state — providing only one when the other isn't already saved is rejected.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateSettingsRequest' }
 *     responses:
 *       200:
 *         description: Updated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SocietySettings' }
 *       400: { description: Invalid input, incomplete bank details pair, or an invalid committee member id., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/admin/settings/committee/{role}/signature:
 *   post:
 *     tags: [Society Settings (Admin)]
 *     summary: Upload a committee member's signature image
 *     description: >
 *       Chairman and Secretary signatures appear on every future-issued receipt (past
 *       receipts are never re-rendered). Treasurer's is stored but not currently used
 *       in receipt rendering. PNG/JPEG/WEBP only, 2MB cap.
 *     parameters:
 *       - name: role
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [chairman, secretary, treasurer] }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Uploaded.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SocietySettings' }
 *       400: { description: Invalid role, missing file, or file content mismatch., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   delete:
 *     tags: [Society Settings (Admin)]
 *     summary: Remove a committee member's signature image
 *     description: Reverts that role's signature block on future receipts to a blank line.
 *     parameters:
 *       - name: role
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [chairman, secretary, treasurer] }
 *     responses:
 *       200:
 *         description: Removed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SocietySettings' }
 *       400: { description: Invalid role., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *   get:
 *     tags: [Society Settings (Admin)]
 *     summary: View a committee member's signature image
 *     description: Authenticated fetch-as-blob, same pattern as payment-proof files — never a public URL.
 *     parameters:
 *       - name: role
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [chairman, secretary, treasurer] }
 *     responses:
 *       200: { description: The signature image. }
 *       400: { description: Invalid role., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: No signature uploaded for that role., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
