import { Router } from 'express';
import {
  getMyFlatHandler,
  removeMyTenantHandler,
  updateMeHandler,
  updateMyFlatHandler,
  upsertMyTenantHandler,
} from './me.controller';
import { requireRole } from '../../middleware/require-role';

export const meRouter = Router();
meRouter.patch('/api/me', requireRole(['ADMIN', 'OWNER', 'TENANT']), updateMeHandler);
meRouter.get('/api/me/flat', requireRole(['OWNER', 'TENANT']), getMyFlatHandler);
// Combined "one Save changes button" save (owner + occupancy + tenant together) — the
// primary path the resident My details page now uses. put/delete /api/me/flat/tenant
// stay as a lower-level alternative, same precedent as the admin id-based
// assignTenant/removeTenant vs createFlat/updateFlat (CLAUDE.md's "Addendum
// (2026-08-06)").
meRouter.put('/api/me/flat', requireRole(['OWNER']), updateMyFlatHandler);
meRouter.put('/api/me/flat/tenant', requireRole(['OWNER']), upsertMyTenantHandler);
meRouter.delete('/api/me/flat/tenant', requireRole(['OWNER']), removeMyTenantHandler);
