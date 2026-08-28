import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
// Express 4's router only forwards synchronously thrown errors to next(err) —
// an uncaught rejection in an async handler would otherwise crash the process.
// Patches the Router/Layer prototype, so must be imported before any route.
import 'express-async-errors';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/requestLogger';
import { adminDashboardRouter } from './features/admin-dashboard/admin-dashboard.route';
import { adminLedgerRouter } from './features/ledger/admin/admin-ledger-route';
import { adminUsersRouter } from './features/users/admin/admin-users-route';
import { authRouter } from './features/auth/auth.route';
import { adminFlatsRouter } from './features/flats/admin/admin-flats-route';
import { residentFlatsRouter } from './features/flats/resident/resident-flats-route';
import { residentLedgerRouter } from './features/ledger/resident/resident-ledger-route';
import { adminReceiptsRouter } from './features/receipts/admin/admin-receipts-route';
import { maintenanceRecordsRouter } from './features/maintenance/maintenance-records.route';
import { profileRouter } from './features/users/profile/profile-route';
import { societySettingsRouter } from './features/society-settings/society-settings.route';
import { feeTypesRouter } from './features/fee-types/fee-types.route';
import { otherChargesRouter } from './features/other-charges/other-charges.route';
import { financeCategoriesRouter } from './features/finance-categories/finance-categories.route';
import { societyLedgerRouter } from './features/society-ledger/society-ledger.route';
import { platformBootstrapRouter } from './features/platform-bootstrap/platform-bootstrap.route';
import { bulkChargesRouter } from './features/bulk-charges/bulk-charges.route';
import { residentVehiclesRouter } from './features/vehicles/resident/resident-vehicles.route';
import { vehicleLookupRouter } from './features/vehicles/lookup/vehicle-lookup.route';
import { openapiSpec } from './infrastructure/openapi/openapi';

export const app = express();

// Trust exactly one reverse-proxy hop (nginx) for X-Forwarded-For, or req.ip
// sees nginx's container IP for every request instead of the real client IP.
app.set('trust proxy', 1);

app.use(requestLogger);

// No-op in Docker/production, where nginx serves both origins as one — only
// matters for local dev (Vite on 5173, backend on 3000).
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true, // required for the browser to send/receive the httpOnly refresh-token cookie
  }),
);
app.use(cookieParser());
app.use(express.json());

// Stops a browser from sniffing a response body's bytes instead of trusting the
// (already content-verified) Content-Type header.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// No auth required to view the docs page — each endpoint documented here still
// enforces its own auth when actually called.
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use(adminDashboardRouter);
app.use(adminLedgerRouter);
app.use(adminUsersRouter);
app.use(authRouter);
app.use(adminFlatsRouter);
app.use(residentFlatsRouter);
app.use(residentVehiclesRouter);
app.use(vehicleLookupRouter);
app.use(residentLedgerRouter);
app.use(adminReceiptsRouter);
app.use(maintenanceRecordsRouter);
app.use(profileRouter);
app.use(societySettingsRouter);
app.use(feeTypesRouter);
app.use(otherChargesRouter);
app.use(financeCategoriesRouter);
app.use(societyLedgerRouter);
app.use(platformBootstrapRouter);
app.use(bulkChargesRouter);

// Must be registered last.
app.use(errorHandler);
