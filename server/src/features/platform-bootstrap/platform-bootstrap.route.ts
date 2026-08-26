import { Router } from 'express';
import { requirePlatformSecret } from '../../middleware/require-platform-secret';
import { bootstrapSocietyHandler } from './platform-bootstrap.controller';

export const platformBootstrapRouter = Router();

// Not under /api/admin/* — no ADMIN JWT can exist before this ever runs. Gated by
// requirePlatformSecret instead.
platformBootstrapRouter.post(
  '/api/platform/societies',
  requirePlatformSecret,
  bootstrapSocietyHandler,
);
