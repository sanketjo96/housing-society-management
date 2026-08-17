import { Router } from 'express';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from './auth.controller';
import { loginRateLimiter } from '../../middleware/auth-rate-limit';
import { requireRole } from '../../middleware/require-role';

export const authRouter = Router();
authRouter.post('/api/auth/login', loginRateLimiter, loginHandler);
authRouter.post('/api/auth/refresh', refreshHandler);
authRouter.post('/api/auth/logout', logoutHandler);
authRouter.get('/api/auth/me', requireRole(['ADMIN', 'OWNER', 'TENANT']), meHandler);
