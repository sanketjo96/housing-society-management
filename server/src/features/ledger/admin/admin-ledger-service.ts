// Admin ledger review: list, approve, reject, and the manual cash/bank-transfer
// fallback. Resident-side ledger actions (Deposit/Credit creation, payment intents)
// live in ../resident/resident-ledger-service.ts; balance/settlement formulas shared
// by both live in ../ledger-shared.ts.
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

// DEPOSIT_PAYMENT_APPROVED (docs/features/notifications/) — fired once the approval (or
// manual mark-paid) transaction has actually committed, so a notification is never
// sent for a payment that ends up rolled back. Never lets a notification failure
// fail the payment approval itself (requirements.md §4) — notify() only ever writes
// a PENDING row, but a stray DB error here still shouldn't take a financial
// approval down with it.
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

// Exported for reuse by ../../receipts/admin/admin-receipts-service.ts's listReceipts,
// which needs the same payer/flat summary shape for its receipt-book rows.
// `createdByType` is a plain scalar column (not listed here — `include` only takes
// relations; every scalar, including createdByType, is returned automatically).
export const LEDGER_ENTRY_LIST_INCLUDE = {
  payer: { select: { id: true, name: true, email: true } },
  flat: { select: { id: true, wing: true, flatNumber: true } },
} as const;

// Admin review queue — optionally filtered by status (defaults to every entry; the
// frontend queue asks for PENDING). No `type` filter anymore — every LedgerEntry is
// a Deposit (Credit removed for good 2026-08-20).
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

// Approve/reject a single LedgerEntry row directly — much simpler than the pre-pivot
// PaymentProof flow, since a Deposit/Credit is never linked to specific
// MaintenanceRecords (settlement is computed against the aggregate, see
// computeRecordSettlements).
//
// Receipt Generation & Approval Workflow (2026-08-11): approval is also the point
// a receipt is issued (see CLAUDE.md's addendum) — the PDF is rendered and saved
// via prepareReceiptForEntry *before* the transaction opens (same "write the file,
// then commit the row" ordering already used for Deposit/Credit proof uploads
// elsewhere in this feature), then the Receipt row is created in the same transaction
// as the status change so the two can never disagree.
export async function approveLedgerEntry(id: string, societyId: string, adminId: string) {
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
  // Which OtherCharge rows this Deposit is about to settle (2026-08-24 addition) —
  // only meaningful for category=OTHER_CHARGE, always empty otherwise. Computed
  // once here, both for the receipt's purpose line below and to actually stamp
  // these rows inside the transaction — a single read reused for both, not two
  // separate queries.
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
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: issuedAt },
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

// Admin manual "mark as paid" fallback for cash/bank-transfer, no proof involved —
// directly creates an already-APPROVED Deposit. Logged as MANUAL_MARK_PAID
// specifically so it's distinguishable in the audit trail from QR-flow approvals (rule
// 7's explicit requirement), same distinct action name as the pre-pivot flow.
//
// Also issues a receipt (2026-08-11 addendum) — a treasurer taking cash needs a
// receipt at least as much as a UPI depositor, arguably more (no screenshot serving
// as informal proof). Unlike approveLedgerEntry, the LedgerEntry doesn't exist yet
// at the point the receipt number needs to be computed (it's derived from the
// entry's own id) — so the id is precomputed via randomUUID() (same helper already
// used by local-storage-adapter.ts) and passed explicitly into both the receipt
// build and the eventual `create`, preserving the same "file saved before the row
// is committed" ordering used everywhere else.
// `category` (docs/features/other-charges/) — default MAINTENANCE, fully backward
// compatible. When OTHER_CHARGE, payerId is always flat.ownerId (matching
// OtherCharge's own payer rule — Other Charges are always owner-billed, unlike
// maintenance's tenant-if-occupied resolution below).
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
        // The admin is the creator here, not the resident being paid for — see
        // CreatedByType's schema comment. This is exactly the distinction that
        // makes a manualDeposit row identifiable without inferring it from `note`
        // text or an AuditLog join.
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
