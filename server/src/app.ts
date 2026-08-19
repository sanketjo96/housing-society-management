import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
// Express 4 does not catch a rejected promise thrown by an async route handler —
// confirmed empirically (Phase 9 security audit, 2026-08-12): an uncaught throw
// inside any async handler crashes the entire Node process instead of reaching
// `errorHandler` below, since Express's router only forwards *synchronously*
// thrown errors to `next(err)`. This patches Express's router to await async
// handlers and forward their rejections to `next(err)` automatically — must be
// imported before any route is registered (it patches the Router/Layer prototype
// Express itself uses), and before any `app.use(...Router)` call below.
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
import { openapiSpec } from './infrastructure/openapi/openapi';

export const app = express();

// Trust exactly one hop of X-Forwarded-For — this deployment always sits behind
// exactly one reverse proxy (nginx, see nginx/default.conf), which sets that header
// itself. Without this, req.ip (and anything keyed off it, e.g. auth-rate-limit.ts)
// sees nginx's own container IP for every request instead of the real client IP.
app.set('trust proxy', 1);

// First in the chain (docs/observablity/), so its measured response time covers the
// full request lifecycle — position relative to routing doesn't affect correctness
// (pino-http hooks res.on('finish'/'close')), only what's included in the timing.
app.use(requestLogger);

// Only matters for local dev, where the Vite dev server (5173) and the backend
// (3000) run as genuinely different origins. In Docker/production, nginx serves both
// under one origin (Task 0.5), so the browser never even applies CORS restrictions to
// same-origin requests — this middleware is a no-op there, not a security boundary.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true, // required for the browser to send/receive the httpOnly refresh-token cookie
  }),
);
app.use(cookieParser());
app.use(express.json());

// Belt-and-braces alongside verify-file-signature.ts's content-based upload check
// (Phase 9 security audit, 2026-08-12): stops a browser from ever second-guessing
// an explicit Content-Type by sniffing a response body's actual bytes. Every file
// this app serves back (proof screenshots, receipts, the treasurer's signature)
// already sets an explicit, now-verified Content-Type — this just makes sure a
// browser is never tempted to override that based on content shape instead.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public API reference — no auth required to view the docs page itself (each endpoint
// documented here still enforces its own real auth when actually called). Deliberately
// reachable outside the VPS: nginx's `location /api/` block already proxies this
// straight through with no extra wiring (nginx/default.conf).
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use(adminDashboardRouter);
app.use(adminLedgerRouter);
app.use(adminUsersRouter);
app.use(authRouter);
app.use(adminFlatsRouter);
app.use(residentFlatsRouter);
app.use(residentLedgerRouter);
app.use(adminReceiptsRouter);
app.use(maintenanceRecordsRouter);
app.use(profileRouter);
app.use(societySettingsRouter);
app.use(feeTypesRouter);
app.use(otherChargesRouter);

// Must be registered last (Express's 4-arg-signature error-middleware convention).
app.use(errorHandler);
