import { Router } from 'express';
import { createUserHandler, getUserHandler } from '../controllers/admin-users.controller';
import { requireRole } from '../middleware/require-role';

export const adminUsersRouter = Router();
adminUsersRouter.post('/api/admin/users', requireRole(['ADMIN']), createUserHandler);
adminUsersRouter.get('/api/admin/users/:id', requireRole(['ADMIN']), getUserHandler);
