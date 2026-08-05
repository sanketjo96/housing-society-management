import { Router } from 'express';
import { loginHandler, logoutHandler, refreshHandler } from '../controllers/auth.controller';

export const authRouter = Router();
authRouter.post('/api/auth/login', loginHandler);
authRouter.post('/api/auth/refresh', refreshHandler);
authRouter.post('/api/auth/logout', logoutHandler);
