import { Router } from 'express';
import { getSocietySettingsHandler, updateSocietySettingsHandler } from '../controllers/society-settings.controller';
import { requireRole } from '../middleware/require-role';

export const societySettingsRouter = Router();
societySettingsRouter.get('/api/admin/settings', requireRole(['ADMIN']), getSocietySettingsHandler);
societySettingsRouter.patch('/api/admin/settings', requireRole(['ADMIN']), updateSocietySettingsHandler);
