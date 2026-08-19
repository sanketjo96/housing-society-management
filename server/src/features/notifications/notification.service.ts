// Public API for the notification feature (Phase 1: WhatsApp only). Business features
// call notify() only — they never see NotificationLog, cron, or WhatsApp types
// (docs/notification/architecture.md §4). deliverPending() is called by
// src/jobs/notification-delivery.job.ts's cron sweep.
import { prisma } from '../../infrastructure/prisma/client';
import type { NotificationChannel } from '../../infrastructure/prisma/generated/client';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import type { NotificationEvent } from './notification.types';
import { sendWhatsAppForNotification } from './whatsapp/whatsapp.service';
import { WhatsAppTransientError } from './whatsapp/whatsapp.types';

const CHANNEL: NotificationChannel = 'WHATSAPP';

// Exported for tests (Task 9's retry/backoff assertions) — not configuration a
// deployment is expected to tune, so plain constants rather than env vars.
export const MAX_ATTEMPTS = 5;
export const CLAIM_BATCH_SIZE = 50;
export const BACKOFF_CAP_MINUTES = 60;

function idempotencyKeyFor(event: NotificationEvent): string {
  const businessId =
    event.eventType === 'MAINTENANCE_BILL_GENERATED' ? event.data.billId : event.data.paymentId;
  return `${event.eventType}:${businessId}:${CHANNEL}`;
}

function relatedEntityFor(event: NotificationEvent): { type: string; id: string } {
  return event.eventType === 'MAINTENANCE_BILL_GENERATED'
    ? { type: 'MaintenanceRecord', id: event.data.billId }
    : { type: 'LedgerEntry', id: event.data.paymentId };
}

// generate idempotency key → INSERT NotificationLog (idempotencyKey UNIQUE) → P2002
// (already claimed) → stop; inserted → row sits PENDING, picked up by the next cron
// sweep. Returns as soon as the row is committed — the caller's business transaction
// never waits on WhatsApp delivery (requirements.md §4).
export async function notify(event: NotificationEvent): Promise<void> {
  const related = relatedEntityFor(event);

  try {
    await prisma.notificationLog.create({
      data: {
        idempotencyKey: idempotencyKeyFor(event),
        eventType: event.eventType,
        channel: CHANNEL,
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
    // string match against). A collision means a duplicate business event: already
    // claimed, nothing further to do.
    const fields = getUniqueConstraintFields(err);
    if (fields) return;
    throw err;
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
// attemptCount < max) and delivers each via the WhatsApp service. One row's failure
// doesn't stop the batch (same "one bad item shouldn't block the rest" pattern
// runMonthlyMaintenanceGeneration already uses per-society).
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
      const result = await sendWhatsAppForNotification({
        eventType: row.eventType,
        recipientUserId: row.recipientUserId,
        payload: row.payload,
      });
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
      const isTransient = err instanceof WhatsAppTransientError;
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
