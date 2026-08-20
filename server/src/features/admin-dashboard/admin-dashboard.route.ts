import { Router } from 'express';
import {
  getDashboardSummaryHandler,
  getFlaggedFlatsHandler,
  getFlatWiseDuesHandler,
  getResidentLedgerOverviewHandler,
} from './admin-dashboard.controller';
import { requireRole } from '../../middleware/require-role';

export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  '/api/admin/dashboard/summary',
  requireRole(['ADMIN']),
  getDashboardSummaryHandler,
);
adminDashboardRouter.get(
  '/api/admin/dashboard/flat-dues',
  requireRole(['ADMIN']),
  getFlatWiseDuesHandler,
);
adminDashboardRouter.get(
  '/api/admin/dashboard/resident-ledger',
  requireRole(['ADMIN']),
  getResidentLedgerOverviewHandler,
);
adminDashboardRouter.get(
  '/api/admin/dashboard/flagged-flats',
  requireRole(['ADMIN']),
  getFlaggedFlatsHandler,
);
