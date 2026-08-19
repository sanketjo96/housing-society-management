import { deliverPending } from '../features/notifications/notification.service';

// Same thin shape as monthly-maintenance-generation.job.ts: no provider logic here,
// just call into the service and log a one-line summary. Registered on node-cron in
// server.ts.
export async function deliverPendingNotifications(): Promise<void> {
  try {
    const { sent, failed } = await deliverPending();
    if (sent > 0 || failed > 0) {
      console.log(`[notification-delivery] sent=${sent} failed=${failed}`);
    }
  } catch (err) {
    console.error('[notification-delivery] sweep failed:', err);
  }
}
