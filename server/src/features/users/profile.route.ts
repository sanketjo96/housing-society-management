import { Router } from 'express';
import { updateMeHandler } from './profile.controller';
import { requireRole } from '../../middleware/require-role';

export const profileRouter = Router();
profileRouter.patch('/api/me', requireRole(['ADMIN', 'OWNER', 'TENANT']), updateMeHandler);
