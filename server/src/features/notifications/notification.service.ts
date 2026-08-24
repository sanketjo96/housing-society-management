// Public API for the notification feature. Business features call notify() only —
// they never see NotificationLog, cron, WhatsApp, or email types (architecture.md
// §4). deliverPending() is called by src/jobs/notification-delivery.job.ts's cron
// sweep. Every event fans out to every channel in activeChannels() independently
// (2026-08-24 addition — Phase 1 shipped WhatsApp-only; architecture.md §3 always
// anticipated "a channel-keyed dispatcher is the natural place to add a second
// channel (Email) later" and the schema's NotificationChannel enum has carried an
// unused EMAIL value since before WhatsApp was even added) — one NotificationLog row
// per channel, each with its own idempotency key, so one channel's failure/retry
// never blocks another.
import { prisma } from '../../infrastructure/prisma/client';
import type { NotificationChannel } from '../../infrastructure/prisma/generated/client';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import { env } from '../../config/env';
import type { NotificationEvent } from './notification.types';
import { sendWhatsAppForNotification } from './whatsapp/whatsapp.service';
import { WhatsAppTransientError } from './whatsapp/whatsapp.types';
import { sendEmailForNotification } from './email/email.service';
import { EmailTransientError } from './email/email.types';

// 2026-08-24: an operational kill switch for the WHATSAPP channel specifically —
// added when the configured WHATSAPP_ACCESS_TOKEN turned out to be a short-lived
// test/dev token that had already expired (a permanent System User token is the
// real fix, tracked separately; this flag exists so the channel can be turned off
// cleanly in the meantime rather than left silently failing every send). Default
// 'true' (unset behaves exactly as before this flag existed) — EMAIL has no
// equivalent flag; nothing has asked for one.
function isWhatsAppEnabled(): boolean {
  return env('WHATSAPP_ENABLED', 'true') !== 'false';
}

function activeChannels(): NotificationChannel[] {
  return isWhatsAppEnabled() ? ['WHATSAPP', 'EMAIL'] : ['EMAIL'];
}

// Exported for tests (Task 9's retry/backoff assertions) — not configuration a
// deployment is expected to tune, so plain constants rather than env vars.
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

// For each channel: generate its idempotency key → INSERT NotificationLog
// (idempotencyKey UNIQUE) → P2002 (already claimed on that channel) → move on to the
// next channel; inserted → row sits PENDING, picked up by the next cron sweep.
// Returns as soon as every channel's row is committed — the caller's business
// transaction never waits on WhatsApp/email delivery (requirements.md §4).
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
      // Detected via getUniqueConstraintFields() — the same P2002 helper every other
      // duplicate-detection path in this app uses (CLAUDE.md's "Gotcha discovered
      // building this" note on Prisma 7's real error shape) — never a hand-rolled
      // check, and never an in-memory dedup (claude-instructions.md's Idempotency
      // Rules). NotificationLog has exactly one unique constraint (idempotencyKey), so
      // any P2002 here can only be that one — no need to match the field name itself
      // (the driver returns it pre-quoted, e.g. `"idempotencyKey"`, which every other
      // caller of this helper also only ever uses for message-building, never an exact
      // string match against). A collision means a duplicate business event on this
      // channel: already claimed, move on to the next channel.
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
// attemptCount < max) and delivers each via the WhatsApp or email service, per its
// own `channel`. One row's failure doesn't stop the batch (same "one bad item
// shouldn't block the rest" pattern runMonthlyMaintenanceGeneration already uses
// per-society).
//
// The claim is a plain findMany + updateMany, not a single atomic
// UPDATE...RETURNING — sufficient here because this app runs exactly one process with
// one node-cron schedule (no concurrent delivery sweeps can race each other); see
// CLAUDE.md's "correctness over scale" mandate.
export async function deliverPending(): Promise<DeliverPendingResult> {
  const now = new Date();

  const candidates = await prisma.notificationLog.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      // While disabled, also leave any already-queued WHATSAPP rows untouched
      // (e.g. from before the flag was flipped off) rather than letting them keep
      // failing against the same broken credential every sweep — a full disable,
      // not just "stop creating new ones."
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

  // Re-fetch rather than reuse `candidates` — cheap at this app's volume, and keeps
  // the loop working off what's actually PROCESSING right now rather than a
  // pre-claim snapshot.
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
      // A permanent error (bad template, rejected number, ...) jumps straight to
      // attemptCount = MAX_ATTEMPTS so the next sweep's `attemptCount < MAX_ATTEMPTS`
      // filter excludes it for good — architecture.md §6: "Do not retry a permanent
      // error... mark it FAILED with attemptCount at the max and stop."
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
