import 'dotenv/config';
import cron from 'node-cron';
import { app } from './app';
import { env } from './config/env';
import { logger } from './infrastructure/observability';
import { runMonthlyMaintenanceGeneration } from './jobs/monthly-maintenance-generation.job';
import { deliverPendingNotifications } from './jobs/notification-delivery.job';

const port = Number(env('PORT', '3000'));
const serverLogger = logger.child({ feature: 'server' });

// R4 — must be registered before app.listen, so a crash during startup is captured
// too, not just once the process is fully up. In dev, pino-pretty formats on a
// worker thread; calling process.exit() immediately after logger.fatal() can race
// that thread and truncate the last line before it flushes. In production there's
// no worker thread (JSON goes straight to stdout synchronously), so the case R4
// actually cares about — a real deployed crash — is unaffected; this is a known,
// accepted limitation of local dev crash logging, not something Stage 1 solves.
process.on('uncaughtException', (err) => {
  serverLogger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  serverLogger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});

app.listen(port, () => {
  serverLogger.info({ port }, 'server listening');
});

// Task 4.4 — 00:05 on the 1st of every month (a few minutes past midnight, not exactly
// on it, to sidestep any timezone-rollover edge case at the boundary). Asia/Kolkata
// explicitly, not the host's local time — this app's currency, phone formats, and
// every seeded example are India-specific, and "the 1st of the month" needs to mean
// the same wall-clock moment regardless of which timezone the VPS host happens to run
// in. Task 4.3's manual-trigger endpoint exists precisely so a missed/delayed run
// (server down at 00:05) can be caught up by hand — see docs/maintenance-records.md.
//
// Arrears billing: no period is passed here, so each run generates for the month that
// just ended (previousPeriod()), not the one just starting — see
// maintenance-record.service.ts's previousPeriod() for why.
cron.schedule(
  '5 0 1 * *',
  () => {
    void runMonthlyMaintenanceGeneration();
  },
  { timezone: 'Asia/Kolkata' },
);

// Notification delivery sweep (docs/notification/) — every minute is a reasonable
// starting interval at this app's ~25-40 notifications/month volume (architecture.md
// §2); adjust once real latency expectations are known. Thin job, no provider logic —
// see notification-delivery.job.ts.
cron.schedule('* * * * *', () => {
  void deliverPendingNotifications();
});
