import { Router } from 'express';
import { createUserHandler } from '../controllers/admin-users.controller';

// TODO(Task 2.5): this route is admin-only by design, but there's no auth/role-guard
// middleware yet to enforce that server-side — anyone can call it right now. Apply
// requireRole(['ADMIN']) here once Task 2.5 lands.
export const adminUsersRouter = Router();
adminUsersRouter.post('/api/admin/users', createUserHandler);
