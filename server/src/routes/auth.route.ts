import { Router } from 'express';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from '../controllers/auth.controller';
import { requireRole } from '../middleware/require-role';

export const authRouter = Router();
authRouter.post('/api/auth/login', loginHandler);
authRouter.post('/api/auth/refresh', refreshHandler);
authRouter.post('/api/auth/logout', logoutHandler);
authRouter.get('/api/auth/me', requireRole(['ADMIN', 'OWNER', 'TENANT']), meHandler);
