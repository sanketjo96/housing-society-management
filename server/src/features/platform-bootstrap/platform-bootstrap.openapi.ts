// OpenAPI docs for platform-bootstrap.route.ts — see auth/auth.openapi.ts's header
// comment for why these live in a sibling file rather than inline above each route.
export {};

/**
 * @openapi
 * /api/platform/societies:
 *   post:
 *     tags: [Platform Bootstrap]
 *     summary: Create a brand-new Society + its first ADMIN user
 *     description: >
 *       Phase A of docs/society-onboarding/ — a concierge-onboarding action run by a
 *       platform operator (curl/Postman/a short internal script), not an
 *       admin-facing feature. Gated by a shared secret
 *       (X-Platform-Bootstrap-Secret header) instead of a JWT, since no admin
 *       account exists yet for the society being created. Never accepts a
 *       client-supplied societyId — the id is generated inside the transaction, so
 *       this endpoint can only create a new society, never reach into an existing
 *       one. The new admin's account is usable immediately via the password-reset
 *       link this triggers (no password is ever returned in the response).
 *     parameters:
 *       - in: header
 *         name: X-Platform-Bootstrap-Secret
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [societyName, societyAddress, adminName, adminEmail]
 *             properties:
 *               societyName: { type: string }
 *               societyAddress: { type: string }
 *               adminName: { type: string }
 *               adminEmail: { type: string, format: email }
 *     responses:
 *       201: { description: "Created. Body has societyId and adminUserId — no password, no token." }
 *       400: { description: Invalid input. }
 *       403: { description: Missing or invalid X-Platform-Bootstrap-Secret header. }
 *       409: { description: adminEmail already belongs to an existing account. }
 *       503: { description: PLATFORM_BOOTSTRAP_SECRET is not configured on this server. }
 */
