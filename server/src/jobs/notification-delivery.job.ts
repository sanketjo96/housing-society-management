import { deliverPending } from '../features/notifications/notification.service';
import { logger } from '../infrastructure/observability';

const jobLogger = logger.child({ feature: 'notification-delivery' });

// Same thin shape as monthly-maintenance-generation.job.ts: no provider logic here,
// just call into the service and log a one-line summary. Registered on node-cron in
// server.ts.
export async function deliverPendingNotifications(): Promise<void> {
  try {
    const { sent, failed } = await deliverPending();
    if (sent > 0 || failed > 0) {
      jobLogger.info({ sent, failed }, 'notification delivery sweep complete');
    }
  } catch (err) {
    jobLogger.error({ err }, 'notification delivery sweep failed');
  }
}
