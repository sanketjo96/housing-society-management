import { Router } from 'express';
import { requirePlatformSecret } from '../../middleware/require-platform-secret';
import { bootstrapSocietyHandler } from './platform-bootstrap.controller';

export const platformBootstrapRouter = Router();

// Deliberately NOT under /api/admin/* — requireRole would need an ADMIN JWT, which
// cannot exist before this endpoint has ever run for a given society. Gated instead
// by requirePlatformSecret (docs/society-onboarding/02-architecture.md's Phase A).
platformBootstrapRouter.post(
  '/api/platform/societies',
  requirePlatformSecret,
  bootstrapSocietyHandler,
);
