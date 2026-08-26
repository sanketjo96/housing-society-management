// Public API for the notification feature. Business features call notify() only —
// they never see NotificationLog, cron, WhatsApp, or email types. Every event fans
// out to every active channel independently — one NotificationLog row per channel,
// each with its own idempotency key, so one channel's failure/retry never blocks
// another. deliverPending() is called by the cron sweep in jobs/.
import { prisma } from '../../infrastructure/prisma/client';
import type { NotificationChannel } from '../../infrastructure/prisma/generated/client';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import { env } from '../../config/env';
import type { NotificationEvent } from './notification.types';
import { sendWhatsAppForNotification } from './whatsapp/whatsapp.service';
import { WhatsAppTransientError } from './whatsapp/whatsapp.types';
import { sendEmailForNotification } from './email/email.service';
import { EmailTransientError } from './email/email.types';

// Kill switch for the WHATSAPP channel specifically — no EMAIL equivalent. Defaults
// to enabled.
function isWhatsAppEnabled(): boolean {
  return env('WHATSAPP_ENABLED', 'true') !== 'false';
}

function activeChannels(): NotificationChannel[] {
  return isWhatsAppEnabled() ? ['WHATSAPP', 'EMAIL'] : ['EMAIL'];
}

export const MAX_ATTEMPTS = 5;
export const CLAIM_BATCH_SIZE = 50;
export const BACKOFF_CAP_MINUTES = 60;

function businessIdFor(event: NotificationEvent): string {
  switch (event.eventType) {
    case 'MAINTENANCE_BILL_GENERATED':
      return event.data.billId;
    case 'OTHER_CHARGE_BILLED':
      return event.data.chargeId;
    case 'DEPOSIT_PAYMENT_APPROVED':
      return event.data.paymentId;
  }
}

function idempotencyKeyFor(event: NotificationEvent, channel: NotificationChannel): string {
  return `${event.eventType}:${businessIdFor(event)}:${channel}`;
}

function relatedEntityFor(event: NotificationEvent): { type: string; id: string } {
  switch (event.eventType) {
    case 'MAINTENANCE_BILL_GENERATED':
      return { type: 'MaintenanceRecord', id: event.data.billId };
    case 'OTHER_CHARGE_BILLED':
      return { type: 'OtherCharge', id: event.data.chargeId };
    case 'DEPOSIT_PAYMENT_APPROVED':
      return { type: 'LedgerEntry', id: event.data.paymentId };
  }
}

// For each channel: insert a PENDING NotificationLog row (idempotencyKey UNIQUE); a
// P2002 means already claimed on that channel, skip to the next. Returns as soon as
// every row is committed — the caller never waits on actual delivery.
export async function notify(event: NotificationEvent): Promise<void> {
  const related = relatedEntityFor(event);

  for (const channel of activeChannels()) {
    try {
      await prisma.notificationLog.create({
        data: {
          idempotencyKey: idempotencyKeyFor(event, channel),
          eventType: event.eventType,
          channel,
          recipientUserId: event.recipient.userId,
          payload: event.data,
          status: 'PENDING',
          relatedEntityType: related.type,
          relatedEntityId: related.id,
        },
      });
    } catch (err) {
      // NotificationLog has exactly one unique constraint (idempotencyKey), so any
      // P2002 here means a duplicate on this channel — already claimed, move on.
      const fields = getUniqueConstraintFields(err);
      if (fields) continue;
      throw err;
    }
  }
}

function backoff(attemptCount: number): Date {
  const minutes = Math.min(2 ** attemptCount, BACKOFF_CAP_MINUTES);
  return new Date(Date.now() + minutes * 60_000);
}

export interface DeliverPendingResult {
  sent: number;
  failed: number;
}

// Claims eligible rows (PENDING or FAILED-and-retryable, nextAttemptAt passed,
// attemptCount < max) and delivers each via its own channel's service. One row's
// failure doesn't stop the batch. The claim is a plain findMany + updateMany, not
// an atomic UPDATE...RETURNING — safe since only one cron schedule ever runs this.
export async function deliverPending(): Promise<DeliverPendingResult> {
  const now = new Date();

  const candidates = await prisma.notificationLog.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      // While disabled, also skip already-queued WHATSAPP rows, not just new ones.
      ...(isWhatsAppEnabled() ? {} : { channel: { not: 'WHATSAPP' } }),
    },
    orderBy: { createdAt: 'asc' },
    take: CLAIM_BATCH_SIZE,
  });
  if (candidates.length === 0) return { sent: 0, failed: 0 };

  const candidateIds = candidates.map((row) => row.id);
  await prisma.notificationLog.updateMany({
    where: { id: { in: candidateIds }, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'PROCESSING' },
  });

  // Re-fetch rather than reuse `candidates`, so the loop works off what's actually
  // PROCESSING now, not a pre-claim snapshot.
  const claimed = await prisma.notificationLog.findMany({
    where: { id: { in: candidateIds }, status: 'PROCESSING' },
  });

  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    try {
      const deliverable = {
        eventType: row.eventType,
        recipientUserId: row.recipientUserId,
        payload: row.payload,
      };
      const result =
        row.channel === 'EMAIL'
          ? await sendEmailForNotification(deliverable)
          : await sendWhatsAppForNotification(deliverable);
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          error: null,
        },
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = err instanceof WhatsAppTransientError || err instanceof EmailTransientError;
      // A permanent error jumps straight to MAX_ATTEMPTS so it's never retried.
      const nextAttemptCount = isTransient ? row.attemptCount + 1 : MAX_ATTEMPTS;
      const willRetry = isTransient && nextAttemptCount < MAX_ATTEMPTS;
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          attemptCount: nextAttemptCount,
          error: message,
          nextAttemptAt: willRetry ? backoff(nextAttemptCount) : null,
        },
      });
      failed++;
    }
  }

  return { sent, failed };
}
