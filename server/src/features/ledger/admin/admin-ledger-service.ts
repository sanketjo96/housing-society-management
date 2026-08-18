// Admin ledger review: list, approve, reject, and the manual cash/bank-transfer
// fallback. Resident-side ledger actions (Deposit/Credit creation, payment intents)
// live in ../resident/resident-ledger-service.ts; balance/settlement formulas shared
// by both live in ../ledger-shared.ts.
import { randomUUID } from 'node:crypto';
import type { LedgerType, ProofStatus } from '../../../infrastructure/prisma/generated/client';
import { prisma } from '../../../infrastructure/prisma/client';
import { LedgerEntryAlreadyReviewedError } from '../../../shared/errors/errors';
import { prepareReceiptForEntry } from '../../receipts/receipt.service';
import { InvalidAmountError } from '../ledger-shared';

export { InvalidAmountError, LedgerEntryAlreadyReviewedError };

// Exported for reuse by ../../receipts/admin/admin-receipts-service.ts's listReceipts,
// which needs the same payer/flat summary shape for its receipt-book rows.
export const LEDGER_ENTRY_LIST_INCLUDE = {
  payer: { select: { id: true, name: true, email: true } },
  flat: { select: { id: true, wing: true, flatNumber: true } },
} as const;

// Admin review queue — optionally filtered by status and/or type (defaults to every
// entry; the frontend queue asks for PENDING, optionally further narrowed by type
// now that there's something to distinguish again post-Credit-reintroduction).
export async function listPendingLedgerEntries(
  societyId: string,
  filters: { status?: ProofStatus; type?: LedgerType } = {},
) {
  return prisma.ledgerEntry.findMany({
    where: {
      flat: { societyId },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
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
  const issuedAt = new Date();
  const { receiptNumber, fileKey } = await prepareReceiptForEntry(
    entry,
    entry.flat,
    entry.payer,
    society,
    issuedAt,
  );

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: issuedAt },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    await tx.receipt.create({
      data: { receiptNumber, fileKey, ledgerEntryId: id, issuedById: adminId, societyId, issuedAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: entry.type === 'DEPOSIT' ? 'APPROVE_DEPOSIT' : 'APPROVE_CREDIT',
        entityType: 'LedgerEntry',
        entityId: id,
        note: `Amount ${entry.amount}; Receipt ${receiptNumber}`,
      },
    });
    return updated;
  });
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
        action: entry.type === 'DEPOSIT' ? 'REJECT_DEPOSIT' : 'REJECT_CREDIT',
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
export async function manualDeposit(
  societyId: string,
  adminId: string,
  flatId: string,
  amount: number,
) {
  if (!(amount > 0)) throw new InvalidAmountError();

  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId } });
  if (!flat) return null;

  const payerId = flat.currentTenantId ?? flat.ownerId;
  const [payer, society] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: payerId }, select: { name: true } }),
    prisma.society.findUniqueOrThrow({
      where: { id: societyId },
      include: { chairman: { select: { name: true } }, secretary: { select: { name: true } } },
    }),
  ]);

  const entryId = randomUUID();
  const issuedAt = new Date();
  const note = 'Manual deposit (cash/bank transfer)';
  const { receiptNumber, fileKey } = await prepareReceiptForEntry(
    { id: entryId, type: 'DEPOSIT', amount, note, payerId },
    { wing: flat.wing, flatNumber: flat.flatNumber },
    payer,
    society,
    issuedAt,
  );

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        id: entryId,
        flatId,
        payerId,
        type: 'DEPOSIT',
        status: 'APPROVED',
        amount,
        note,
        reviewedById: adminId,
        reviewedAt: issuedAt,
      },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    await tx.receipt.create({
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
    return entry;
  });
}
