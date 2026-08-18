import { Router } from 'express';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  requestResetHandler,
  resetHandler,
} from './auth.controller';
import {
  loginRateLimiter,
  passwordResetRateLimiter,
} from '../../middleware/auth-rate-limit';
import { requireRole } from '../../middleware/require-role';

export const authRouter = Router();

// Session
authRouter.post('/api/auth/login', loginRateLimiter, loginHandler);
authRouter.post('/api/auth/refresh', refreshHandler);
authRouter.post('/api/auth/logout', logoutHandler);
authRouter.get('/api/auth/me', requireRole(['ADMIN', 'OWNER', 'TENANT']), meHandler);

// Password reset
authRouter.post('/api/auth/request-reset', passwordResetRateLimiter, requestResetHandler);
authRouter.post('/api/auth/reset', passwordResetRateLimiter, resetHandler);
