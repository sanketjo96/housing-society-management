import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import type { MaintenanceBillGeneratedEvent } from '../../../src/features/notifications/notification.types';
import { deliverPending, MAX_ATTEMPTS, notify } from '../../../src/features/notifications/notification.service';
import {
  WhatsAppPermanentError,
  WhatsAppTransientError,
} from '../../../src/features/notifications/whatsapp/whatsapp.types';
import { EmailPermanentError, EmailTransientError } from '../../../src/features/notifications/email/email.types';

const sendWhatsAppForNotification = vi.fn();
vi.mock('../../../src/features/notifications/whatsapp/whatsapp.service', () => ({
  sendWhatsAppForNotification: (...args: unknown[]) => sendWhatsAppForNotification(...args),
}));

const sendEmailForNotification = vi.fn();
vi.mock('../../../src/features/notifications/email/email.service', () => ({
  sendEmailForNotification: (...args: unknown[]) => sendEmailForNotification(...args),
}));

interface MockDeliveryRow {
  payload: { billId?: string };
}

// deliverPending() sweeps every eligible row in the table, not just the ones this
// test created — other test files' own notify() calls (e.g. maintenance-record and
// admin-ledger tests, which now trigger real notifications as a side effect) can
// leave unrelated PENDING rows sitting in the same DB. Matching on this test's own
// billId (carried in the payload) rather than relying on call order/count keeps
// these assertions correct regardless of what else the sweep happens to pick up.
function mockDeliveryForBill(
  billId: string,
  behavior: (row: MockDeliveryRow) => Promise<{ providerMessageId: string }>,
) {
  sendWhatsAppForNotification.mockImplementation(async (row: MockDeliveryRow) => {
    if (row.payload?.billId !== billId) return { providerMessageId: 'wamid.unrelated-row' };
    return behavior(row);
  });
}

type NotificationLogRow = Awaited<ReturnType<typeof prisma.notificationLog.findFirstOrThrow>>;

// deliverPending() claims up to CLAIM_BATCH_SIZE eligible rows per sweep, oldest
// first, across the *whole* table — with other test files also triggering real
// notifications concurrently (maintenance-record/admin-ledger hooks), this test's own
// row isn't guaranteed to be in the very first batch. Sweeping repeatedly until the
// row reaches the expected state (rather than asserting after exactly one sweep)
// keeps these assertions correct under that contention instead of flaking on it.
// Scoped to the WHATSAPP-channel row specifically — since notify() now creates one
// row per channel (2026-08-24), an unscoped lookup could non-deterministically match
// either this test's WHATSAPP row or its sibling EMAIL row.
async function sweepUntil(
  billId: string,
  predicate: (row: NotificationLogRow) => boolean,
  maxSweeps = 20,
): Promise<NotificationLogRow> {
  let row = await prisma.notificationLog.findFirstOrThrow({
    where: { relatedEntityType: 'MaintenanceRecord', relatedEntityId: billId, channel: 'WHATSAPP' },
  });
  for (let i = 0; i < maxSweeps && !predicate(row); i++) {
    await deliverPending();
    row = await prisma.notificationLog.findFirstOrThrow({ where: { id: row.id } });
  }
  return row;
}

// Same idea, for the EMAIL-channel sibling row.
async function sweepUntilEmail(
  billId: string,
  predicate: (row: NotificationLogRow) => boolean,
  maxSweeps = 20,
): Promise<NotificationLogRow> {
  let row = await prisma.notificationLog.findFirstOrThrow({
    where: { relatedEntityType: 'MaintenanceRecord', relatedEntityId: billId, channel: 'EMAIL' },
  });
  for (let i = 0; i < maxSweeps && !predicate(row); i++) {
    await deliverPending();
    row = await prisma.notificationLog.findFirstOrThrow({ where: { id: row.id } });
  }
  return row;
}

function buildMaintenanceEvent(billId: string, recipientUserId: string): MaintenanceBillGeneratedEvent {
  return {
    eventId: randomUUID(),
    eventType: 'MAINTENANCE_BILL_GENERATED',
    occurredAt: new Date().toISOString(),
    recipient: { userId: recipientUserId },
    data: {
      billId,
      flatId: randomUUID(),
      societyId: randomUUID(),
      billingMonth: '2026-08',
      amount: 2000,
      dueDate: new Date().toISOString(),
    },
  };
}

// recipientUserId has no FK constraint on NotificationLog (see architecture.md §5 —
// the model intentionally has no relation declared), so these tests use bare random
// ids rather than provisioning real Society/User/Flat rows.
describe('notification.service', () => {
  const trackedBillIds: string[] = [];

  beforeEach(() => {
    // Default every EMAIL-channel row to succeed immediately, so tests focused on
    // WHATSAPP-channel behavior aren't affected by their sibling EMAIL row sitting in
    // the same claim batch. Tests that care about EMAIL-specific behavior override
    // this per-test.
    sendEmailForNotification.mockResolvedValue({ providerMessageId: null });
  });

  afterEach(async () => {
    sendWhatsAppForNotification.mockReset();
    sendEmailForNotification.mockReset();
    await prisma.notificationLog.deleteMany({
      where: { relatedEntityType: 'MaintenanceRecord', relatedEntityId: { in: trackedBillIds } },
    });
    trackedBillIds.length = 0;
  });

  it('fans out to both the WHATSAPP and EMAIL channels, each with its own idempotency key', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    const recipientUserId = randomUUID();

    await notify(buildMaintenanceEvent(billId, recipientUserId));

    const rows = await prisma.notificationLog.findMany({
      where: { relatedEntityType: 'MaintenanceRecord', relatedEntityId: billId },
      orderBy: { channel: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.channel)).toEqual(['EMAIL', 'WHATSAPP']);
    expect(rows.map((r) => r.idempotencyKey)).toEqual([
      `MAINTENANCE_BILL_GENERATED:${billId}:EMAIL`,
      `MAINTENANCE_BILL_GENERATED:${billId}:WHATSAPP`,
    ]);
    expect(rows.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('is idempotent per channel — the same business event twice still creates only one row per channel', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    const recipientUserId = randomUUID();

    await notify(buildMaintenanceEvent(billId, recipientUserId));
    // A duplicate business event carries a different eventId (a fresh occurrence of
    // the same fact) but the same billId — notify() must still dedupe on billId, per
    // channel.
    await notify(buildMaintenanceEvent(billId, recipientUserId));

    const rows = await prisma.notificationLog.findMany({
      where: { relatedEntityType: 'MaintenanceRecord', relatedEntityId: billId },
    });
    expect(rows).toHaveLength(2);
  });

  it('never calls the WhatsApp or email service from notify() itself — delivery is deferred to the sweep', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    await notify(buildMaintenanceEvent(billId, randomUUID()));
    expect(sendWhatsAppForNotification).not.toHaveBeenCalled();
    expect(sendEmailForNotification).not.toHaveBeenCalled();
  });

  it('deliverPending() marks a successful send as SENT and stores the providerMessageId', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    await notify(buildMaintenanceEvent(billId, randomUUID()));
    mockDeliveryForBill(billId, async () => ({ providerMessageId: 'wamid.success' }));

    const row = await sweepUntil(billId, (r) => r.status === 'SENT');

    expect(row.status).toBe('SENT');
    expect(row.providerMessageId).toBe('wamid.success');
    expect(row.sentAt).not.toBeNull();
    expect(row.error).toBeNull();
  });

  it('retries a transient failure once nextAttemptAt has passed, and not before', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    await notify(buildMaintenanceEvent(billId, randomUUID()));

    let attemptsSoFar = 0;
    mockDeliveryForBill(billId, async () => {
      attemptsSoFar++;
      if (attemptsSoFar === 1) throw new WhatsAppTransientError('temporary Meta outage');
      return { providerMessageId: 'wamid.retry-success' };
    });
    // attemptsSoFar only increments when *this test's* row is actually delivered
    // (mockDeliveryForBill matches on billId), so it's an exact count regardless of
    // how many contention sweeps sweepUntil needed to reach it.
    let row = await sweepUntil(billId, () => attemptsSoFar >= 1);
    expect(row.status).toBe('FAILED');
    expect(row.attemptCount).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // nextAttemptAt hasn't passed yet — further sweeps must leave this row alone no
    // matter how many run, since the claim query excludes it purely by time.
    await deliverPending();
    await deliverPending();
    row = await prisma.notificationLog.findFirstOrThrow({ where: { id: row.id } });
    expect(row.attemptCount).toBe(1);
    expect(row.status).toBe('FAILED');
    expect(attemptsSoFar).toBe(1);

    // Force the backoff window into the past and retry — this time it succeeds.
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    row = await sweepUntil(billId, (r) => r.status === 'SENT');
    expect(row.status).toBe('SENT');
    expect(row.providerMessageId).toBe('wamid.retry-success');
  });

  it('a permanent failure reaches FAILED immediately, with no further retries', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    await notify(buildMaintenanceEvent(billId, randomUUID()));

    mockDeliveryForBill(billId, async () => {
      throw new WhatsAppPermanentError('template not approved');
    });
    const row = await sweepUntil(billId, (r) => r.status === 'FAILED');

    expect(row.status).toBe('FAILED');
    expect(row.attemptCount).toBe(MAX_ATTEMPTS);
    expect(row.nextAttemptAt).toBeNull();

    // attemptCount is already at the max, so the claim query's `attemptCount < max`
    // filter must exclude this row from now on — its state should be untouched by a
    // further sweep even without re-mocking a rejection.
    await deliverPending();
    const after = await prisma.notificationLog.findFirstOrThrow({ where: { id: row.id } });
    expect(after.attemptCount).toBe(MAX_ATTEMPTS);
    expect(after.status).toBe('FAILED');
    expect(after.updatedAt.getTime()).toBe(row.updatedAt.getTime());
  });

  // The EMAIL channel shares deliverPending()'s claim/retry/backoff logic entirely
  // with WHATSAPP (already exercised in full above) — these three tests only need to
  // prove the channel routing itself: EMAIL rows call sendEmailForNotification (not
  // sendWhatsAppForNotification), and EmailTransientError/EmailPermanentError drive
  // retry the same way their WhatsApp counterparts do.
  it('deliverPending() delivers the EMAIL channel row via the email service', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    await notify(buildMaintenanceEvent(billId, randomUUID()));
    mockDeliveryForBill(billId, async () => ({ providerMessageId: 'wamid.whatsapp-side' }));

    const row = await sweepUntilEmail(billId, (r) => r.status === 'SENT');

    expect(row.status).toBe('SENT');
    expect(row.sentAt).not.toBeNull();
    expect(sendEmailForNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MAINTENANCE_BILL_GENERATED' }),
    );
  });

  it('retries a transient email failure, and stops after a permanent one', async () => {
    const billId = randomUUID();
    trackedBillIds.push(billId);
    await notify(buildMaintenanceEvent(billId, randomUUID()));
    mockDeliveryForBill(billId, async () => ({ providerMessageId: 'wamid.whatsapp-side' }));

    sendEmailForNotification.mockImplementation(async (row: MockDeliveryRow) => {
      if (row.payload?.billId !== billId) return { providerMessageId: null };
      throw new EmailTransientError('Resend API timeout');
    });
    let row = await sweepUntilEmail(billId, (r) => r.status === 'FAILED');
    expect(row.attemptCount).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();

    sendEmailForNotification.mockImplementation(async (r: MockDeliveryRow) => {
      if (r.payload?.billId !== billId) return { providerMessageId: null };
      throw new EmailPermanentError('recipient not found');
    });
    await prisma.notificationLog.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    row = await sweepUntilEmail(billId, (r) => r.attemptCount === MAX_ATTEMPTS);

    expect(row.status).toBe('FAILED');
    expect(row.attemptCount).toBe(MAX_ATTEMPTS);
    expect(row.nextAttemptAt).toBeNull();
  });
});
