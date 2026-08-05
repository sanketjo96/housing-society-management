import { Router } from 'express';
import { requestResetHandler, resetHandler } from '../controllers/password-reset.controller';

export const passwordResetRouter = Router();
passwordResetRouter.post('/api/auth/request-reset', requestResetHandler);
passwordResetRouter.post('/api/auth/reset', resetHandler);
