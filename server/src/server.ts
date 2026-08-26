import 'dotenv/config';
import cron from 'node-cron';
import { app } from './app';
import { env } from './config/env';
import { logger } from './infrastructure/observability';
import { runMonthlyMaintenanceGeneration } from './jobs/monthly-maintenance-generation.job';
import { deliverPendingNotifications } from './jobs/notification-delivery.job';

const port = Number(env('PORT', '3000'));
const serverLogger = logger.child({ feature: 'server' });

// Registered before app.listen so a startup crash is captured too. In dev,
// pino-pretty's worker thread can race process.exit() and truncate the last log
// line — production logs synchronously, so this only affects local dev.
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

// 00:05 on the 1st, Asia/Kolkata regardless of host timezone. No period passed,
// so this generates for the month that just ended (arrears billing).
cron.schedule(
  '5 0 1 * *',
  () => {
    void runMonthlyMaintenanceGeneration();
  },
  { timezone: 'Asia/Kolkata' },
);

// Notification delivery sweep — every minute.
cron.schedule('* * * * *', () => {
  void deliverPendingNotifications();
});
