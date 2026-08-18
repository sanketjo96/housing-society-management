import { Router } from 'express';
import { createUserHandler, getUserHandler } from './admin-users.controller';
import { requireRole } from '../../middleware/require-role';

export const adminUsersRouter = Router();

/**
 * @openapi
 * /api/admin/users:
 *   post:
 *     tags: [Users (Admin)]
 *     summary: Create a user account directly
 *     description: >
 *       societyId is always the caller's own — never accepted from the request body
 *       (Phase 9 security fix). In practice, flat onboarding's find-or-create flow
 *       (POST /api/admin/flats) is the more common way accounts get created; this is
 *       the lower-level primitive.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [ADMIN, OWNER, TENANT] }
 *     responses:
 *       201:
 *         description: Created.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserPublic' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: email or phone already in use., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
adminUsersRouter.post('/api/admin/users', requireRole(['ADMIN']), createUserHandler);

/**
 * @openapi
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Users (Admin)]
 *     summary: Get a user by id, scoped to the caller's own society
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserPublic' }
 *       401: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Caller is not an ADMIN., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       404: { description: 'No such user, or the id belongs to a different society.', content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
adminUsersRouter.get('/api/admin/users/:id', requireRole(['ADMIN']), getUserHandler);
