// Admin ledger review: list, approve, reject, and the manual cash/bank-transfer
// fallback. Resident-side actions live in ../resident/resident-ledger-service.ts.
import { randomUUID } from 'node:crypto';
import type {
  CreatedByType,
  LedgerCategory,
  ProofStatus,
} from '../../../infrastructure/prisma/generated/client';
import { prisma } from '../../../infrastructure/prisma/client';
import { logger } from '../../../infrastructure/observability';
import {
  LedgerEntryAlreadyReviewedError,
  SignaturesNotConfiguredError,
} from '../../../shared/errors/errors';
import { getOpenOtherCharges, prepareReceiptForEntry } from '../../receipts/receipt.service';
import { notify } from '../../notifications/notification.service';
import { InvalidAmountError } from '../ledger-shared';

export { InvalidAmountError, LedgerEntryAlreadyReviewedError, SignaturesNotConfiguredError };

// Fired only after the approval transaction commits. A notification failure never
// fails the payment approval itself.
async function notifyLedgerPaymentApproved(
  entry: { id: string; flatId: string; payerId: string; amount: unknown },
  receiptId: string,
  societyId: string,
  paymentDate: Date,
): Promise<void> {
  try {
    await notify({
      eventId: randomUUID(),
      eventType: 'DEPOSIT_PAYMENT_APPROVED',
      occurredAt: new Date().toISOString(),
      recipient: { userId: entry.payerId },
      data: {
        paymentId: entry.id,
        receiptId,
        flatId: entry.flatId,
        societyId,
        amount: Number(entry.amount),
        paymentDate: paymentDate.toISOString(),
      },
    });
  } catch (err) {
    logger
      .child({ feature: 'ledger' })
      .error({ err, entryId: entry.id }, 'failed to enqueue payment-approved notification');
  }
}

// Exported for reuse by admin-receipts-service.ts's listReceipts (same row shape).
export const LEDGER_ENTRY_LIST_INCLUDE = {
  payer: { select: { id: true, name: true, email: true } },
  flat: { select: { id: true, wing: true, flatNumber: true } },
} as const;

// Admin review queue, optionally filtered by status/category/createdByType.
export async function listPendingLedgerEntries(
  societyId: string,
  filters: {
    status?: ProofStatus;
    category?: LedgerCategory;
    createdByType?: CreatedByType;
  } = {},
) {
  return prisma.ledgerEntry.findMany({
    where: {
      flat: { societyId },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.createdByType ? { createdByType: filters.createdByType } : {}),
    },
    include: LEDGER_ENTRY_LIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

// Approving settles the entry and issues its receipt in one step. The receipt PDF
// is rendered and saved before the transaction opens; the Receipt row is created
// inside the same transaction as the status change so the two never disagree.
export async function approveLedgerEntry(
  id: string,
  societyId: string,
  adminId: string,
  // Optional here — required only at the Zod/controller boundary
  // (approveLedgerSchema). ~15 existing tests call this service directly and
  // don't exercise the bank-reference requirement; that requirement belongs
  // to the HTTP API shape, not this function's business logic.
  bankReference?: string,
) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id, flat: { societyId } },
    include: {
      flat: { select: { wing: true, flatNumber: true } },
      payer: { select: { name: true } },
    },
  });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    include: { chairman: { select: { name: true } }, secretary: { select: { name: true } } },
  });
  // Which OtherCharge rows this Deposit is about to settle — only meaningful for
  // category=OTHER_CHARGE. Reused for both the receipt purpose line and the stamp
  // below.
  const openOtherCharges =
    entry.category === 'OTHER_CHARGE' ? await getOpenOtherCharges(entry.flatId) : { ids: [], feeTypeNames: [] };
  const issuedAt = new Date();
  const { receiptNumber, fileKey } = await prepareReceiptForEntry(
    entry,
    entry.flat,
    entry.payer,
    society,
    issuedAt,
    openOtherCharges.feeTypeNames,
  );

  const { updated, receiptId } = await prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: issuedAt,
        bankReference: bankReference ?? null,
      },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    if (openOtherCharges.ids.length > 0) {
      await tx.otherCharge.updateMany({
        where: { id: { in: openOtherCharges.ids } },
        data: { settledByLedgerEntryId: id },
      });
    }
    const receipt = await tx.receipt.create({
      data: { receiptNumber, fileKey, ledgerEntryId: id, issuedById: adminId, societyId, issuedAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'APPROVE_DEPOSIT',
        entityType: 'LedgerEntry',
        entityId: id,
        note: `Amount ${entry.amount}; Receipt ${receiptNumber}`,
      },
    });
    return { updated, receiptId: receipt.id };
  });

  await notifyLedgerPaymentApproved(updated, receiptId, societyId, issuedAt);

  return updated;
}

export async function rejectLedgerEntry(
  id: string,
  societyId: string,
  adminId: string,
  reason?: string,
) {
  const entry = await prisma.ledgerEntry.findFirst({ where: { id, flat: { societyId } } });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        adminNote: reason,
      },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'REJECT_DEPOSIT',
        entityType: 'LedgerEntry',
        entityId: id,
        note: reason ?? `Amount ${entry.amount} rejected`,
      },
    });
    return updated;
  });
}

// Admin "mark as paid" fallback for cash/bank-transfer — directly creates an
// already-APPROVED Deposit and issues its receipt, logged as MANUAL_MARK_PAID to
// stay distinguishable from QR-flow approvals. The entry id is precomputed
// (randomUUID) since the receipt number needs it before the row is created.
// OTHER_CHARGE always bills flat.ownerId; maintenance bills the current tenant if
// occupied, else the owner.
export async function manualDeposit(
  societyId: string,
  adminId: string,
  flatId: string,
  amount: number,
  category: LedgerCategory = 'MAINTENANCE',
) {
  if (!(amount > 0)) throw new InvalidAmountError();

  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId } });
  if (!flat) return null;

  const payerId = category === 'OTHER_CHARGE' ? flat.ownerId : (flat.currentTenantId ?? flat.ownerId);
  const [payer, society] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: payerId }, select: { name: true } }),
    prisma.society.findUniqueOrThrow({
      where: { id: societyId },
      include: { chairman: { select: { name: true } }, secretary: { select: { name: true } } },
    }),
  ]);

  const openOtherCharges =
    category === 'OTHER_CHARGE' ? await getOpenOtherCharges(flatId) : { ids: [], feeTypeNames: [] };
  const entryId = randomUUID();
  const issuedAt = new Date();
  const note = 'Manual deposit (cash/bank transfer)';
  const { receiptNumber, fileKey } = await prepareReceiptForEntry(
    { id: entryId, amount, note, payerId, category },
    { wing: flat.wing, flatNumber: flat.flatNumber },
    payer,
    society,
    issuedAt,
    openOtherCharges.feeTypeNames,
  );

  const { entry, receiptId } = await prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        id: entryId,
        flatId,
        payerId,
        status: 'APPROVED',
        amount,
        note,
        reviewedById: adminId,
        reviewedAt: issuedAt,
        // The admin is the creator here, not the resident being paid for.
        createdById: adminId,
        createdByType: 'ADMIN',
        category,
      },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    // Must come after the LedgerEntry create above — settledByLedgerEntryId is a
    // real FK to LedgerEntry.id, which doesn't exist yet until this point.
    if (openOtherCharges.ids.length > 0) {
      await tx.otherCharge.updateMany({
        where: { id: { in: openOtherCharges.ids } },
        data: { settledByLedgerEntryId: entryId },
      });
    }
    const receipt = await tx.receipt.create({
      data: {
        receiptNumber,
        fileKey,
        ledgerEntryId: entryId,
        issuedById: adminId,
        societyId,
        issuedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'MANUAL_MARK_PAID',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        note: `Amount ${amount}; Receipt ${receiptNumber}`,
      },
    });
    return { entry, receiptId: receipt.id };
  });

  await notifyLedgerPaymentApproved(entry, receiptId, societyId, issuedAt);

  return entry;
}
