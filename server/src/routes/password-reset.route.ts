import { Router } from 'express';
import { requestResetHandler, resetHandler } from '../controllers/password-reset.controller';
import { passwordResetRateLimiter } from '../middleware/auth-rate-limit';

export const passwordResetRouter = Router();
passwordResetRouter.post('/api/auth/request-reset', passwordResetRateLimiter, requestResetHandler);
passwordResetRouter.post('/api/auth/reset', passwordResetRateLimiter, resetHandler);
