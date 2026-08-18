// OpenAPI docs for auth.route.ts's endpoints, kept in a sibling file rather than
// inline above each route registration — swagger-jsdoc only needs to find these
// comment blocks somewhere in a matched file (src/infrastructure/openapi/openapi.ts's
// `apis` glob), not attached to specific code, so pulling them out here keeps
// auth.route.ts itself readable while still living right next to what it documents.
export {};

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: >
 *       On success, sets an httpOnly `refreshToken` cookie (scoped to /api/auth, 7-day
 *       TTL) and returns a 15-minute access token. Rate-limited.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login succeeded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 user: { $ref: '#/components/schemas/UserPublic' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Invalid email or password, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       429: { description: Too many attempts — rate limited. }
 */

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange the refresh-token cookie for a fresh access token
 *     description: >
 *       Reads the httpOnly `refreshToken` cookie set at login — no request body, no
 *       Authorization header. Used for silent session restore on page load.
 *     security:
 *       - refreshTokenCookie: []
 *     responses:
 *       200:
 *         description: A fresh access token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *       401: { description: Missing, invalid, expired, or revoked refresh token., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the current refresh token and clear its cookie
 *     description: Idempotent — logging out an already-invalid/unknown token is a no-op, not an error.
 *     security:
 *       - refreshTokenCookie: []
 *     responses:
 *       200:
 *         description: Always succeeds.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Logged out' }
 */

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     responses:
 *       200:
 *         description: The caller's own account.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserPublic' }
 *       401: { description: Missing or invalid access token., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: Token valid but the user row no longer exists., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */

/**
 * @openapi
 * /api/auth/request-reset:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password-reset email
 *     description: >
 *       Always responds 200 regardless of whether the email exists, so this endpoint
 *       can't be used to enumerate accounts. The reset link expires in 1 hour. Rate-limited.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Always returned, whether or not the email exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'If that email exists, a reset link has been sent.' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       429: { description: Too many attempts — rate limited. }
 */

/**
 * @openapi
 * /api/auth/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Reset a password using a reset-email token
 *     description: On success, also revokes every existing refresh token for that account.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Password reset successfully.' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Invalid, expired, or already-used token., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       429: { description: Too many attempts — rate limited. }
 */
