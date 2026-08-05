import { Router } from 'express';
import { createUserHandler } from '../controllers/admin-users.controller';
import { requireRole } from '../middleware/require-role';

export const adminUsersRouter = Router();
adminUsersRouter.post('/api/admin/users', requireRole(['ADMIN']), createUserHandler);
