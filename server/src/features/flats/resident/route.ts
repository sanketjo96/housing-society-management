import { Router } from 'express';
import {
  getMyFlatHandler,
  removeMyTenantHandler,
  updateMyFlatHandler,
  upsertMyTenantHandler,
} from './controller';
import { requireRole } from '../../../middleware/require-role';

export const residentFlatsRouter = Router();
residentFlatsRouter.get('/api/me/flat', requireRole(['OWNER', 'TENANT']), getMyFlatHandler);
// Combined "one Save changes button" save (owner + occupancy + tenant together) — the
// primary path the resident My details page now uses. put/delete /api/me/flat/tenant
// stay as a lower-level alternative, same precedent as the admin id-based
// assignTenant/removeTenant vs createFlat/updateFlat (CLAUDE.md's "Addendum
// (2026-08-06)").
residentFlatsRouter.put('/api/me/flat', requireRole(['OWNER']), updateMyFlatHandler);
residentFlatsRouter.put('/api/me/flat/tenant', requireRole(['OWNER']), upsertMyTenantHandler);
residentFlatsRouter.delete('/api/me/flat/tenant', requireRole(['OWNER']), removeMyTenantHandler);
