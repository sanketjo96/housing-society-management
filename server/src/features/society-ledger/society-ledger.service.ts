// SocietyLedgerEntry — "Manage Finance" (docs/manage-finance/). A complete,
// already-true transaction record the moment it's created (same shape as
// OtherCharge/manualDeposit), NOT LedgerEntry's Deposit/Credit PENDING-then-
// reviewed shape. Single-admin entry, immutable once created — no approval
// workflow. No settlement/FIFO concept at all: nothing here reads or writes
// LedgerEntry, MaintenanceRecord, or OtherCharge.
import { prisma } from '../../infrastructure/prisma/client';
import { getStorageAdapter } from '../../infrastructure/storage';
import type {
  SocietyLedgerDirection,
  SocietyLedgerPaymentMethod,
} from '../../infrastructure/prisma/generated/client';

export class FinanceCategoryNotUsableError extends Error {
  constructor() {
    super('This finance category is not available for use (missing, inactive, or wrong society)');
    this.name = 'FinanceCategoryNotUsableError';
  }
}

export class CategoryDirectionMismatchError extends Error {
  constructor() {
    super("The entry's direction does not match the chosen category's direction");
    this.name = 'CategoryDirectionMismatchError';
  }
}

export class MissingBankReferenceError extends Error {
  constructor() {
    super('A bank/transaction reference is required unless payment method is Cash');
    this.name = 'MissingBankReferenceError';
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super('Amount must be greater than 0');
    this.name = 'InvalidAmountError';
  }
}

const SOCIETY_LEDGER_LIST_INCLUDE = {
  category: { select: { id: true, name: true, direction: true } },
  recordedBy: { select: { id: true, name: true } },
} as const;

export interface SocietyLedgerEntryListItem {
  id: string;
  direction: SocietyLedgerDirection;
  amount: unknown;
  transactionDate: Date;
  paymentMethod: SocietyLedgerPaymentMethod;
  bankReference: string | null;
  note: string | null;
  fileUrl: string | null;
  createdAt: Date;
  category: { id: string; name: string; direction: SocietyLedgerDirection };
  recordedBy: { id: string; name: string };
}

// Newest-first by transactionDate (the date money actually moved), not createdAt —
// matches how an admin actually thinks about "recent history" here.
export async function listSocietyLedgerEntries(societyId: string): Promise<SocietyLedgerEntryListItem[]> {
  return prisma.societyLedgerEntry.findMany({
    where: { societyId },
    include: SOCIETY_LEDGER_LIST_INCLUDE,
    orderBy: { transactionDate: 'desc' },
  });
}

export interface RecordSocietyLedgerEntryInput {
  direction: SocietyLedgerDirection;
  categoryId: string;
  amount: number;
  transactionDate: Date;
  paymentMethod: SocietyLedgerPaymentMethod;
  bankReference?: string;
  note?: string;
  file: { buffer: Buffer; mimeType: string; extension: string };
}

// Shared between recordSocietyLedgerEntry (below) and
// society-ledger-bulk-import-service.ts's bulkImportSocietyLedgerEntries — the two
// checks that don't depend on how the category was looked up (by id vs. by name) or
// whether a file is involved. Extracted (2026-08-21, docs/society-onboarding/ Phase
// E) rather than duplicated, so the bulk path can never silently drift from the
// single-row path's validation rules.
export function assertValidSocietyLedgerEntry<T extends { direction: SocietyLedgerDirection }>(
  category: T | null,
  input: {
    amount: number;
    direction: SocietyLedgerDirection;
    paymentMethod: SocietyLedgerPaymentMethod;
    bankReference?: string;
  },
): asserts category is T {
  if (!(input.amount > 0)) throw new InvalidAmountError();
  if (!category) throw new FinanceCategoryNotUsableError();
  if (category.direction !== input.direction) throw new CategoryDirectionMismatchError();
  if (input.paymentMethod !== 'CASH' && !input.bankReference?.trim()) {
    throw new MissingBankReferenceError();
  }
}

// The one write path. categoryId is revalidated server-side against societyId +
// isActive (never trusted from the client beyond existence, same contract as
// billOtherCharge's feeTypeId lookup). direction-matches-category and
// bank-reference-required-unless-CASH are both re-checked here even though the
// Zod schema already enforces the latter — defense in depth, same precedent as
// billOtherCharge re-checking amount > 0 despite its own Zod schema requiring it.
export async function recordSocietyLedgerEntry(
  societyId: string,
  adminId: string,
  input: RecordSocietyLedgerEntryInput,
) {
  const category = await prisma.societyLedgerCategory.findFirst({
    where: { id: input.categoryId, societyId, isActive: true },
  });
  assertValidSocietyLedgerEntry(category, input);

  const saved = await getStorageAdapter().save({
    buffer: input.file.buffer,
    societyId,
    extension: input.file.extension,
  });

  return prisma.$transaction(async (tx) => {
    const entry = await tx.societyLedgerEntry.create({
      data: {
        societyId,
        direction: input.direction,
        categoryId: category.id,
        amount: input.amount,
        transactionDate: input.transactionDate,
        paymentMethod: input.paymentMethod,
        bankReference: input.bankReference?.trim() || undefined,
        note: input.note,
        fileUrl: saved.key,
        mimeType: input.file.mimeType,
        recordedById: adminId,
      },
      include: SOCIETY_LEDGER_LIST_INCLUDE,
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'RECORD_SOCIETY_LEDGER_ENTRY',
        entityType: 'SocietyLedgerEntry',
        entityId: entry.id,
        note: `${entry.direction} ${input.amount} — ${category.name}`,
      },
    });
    return entry;
  });
}

export interface SocietyLedgerTotals {
  totalIncome: number;
  totalExpense: number;
  net: number;
}

// Society-wide, all-time totals — feeds admin-dashboard.service.ts's
// getDashboardSummary. Plain findMany + reduce, matching this codebase's existing
// aggregation style (getBalancesByFlat, listOtherCharges) rather than
// prisma.groupBy, at this app's 24-flat scale.
export async function getSocietyLedgerTotals(societyId: string): Promise<SocietyLedgerTotals> {
  const entries = await prisma.societyLedgerEntry.findMany({
    where: { societyId },
    select: { direction: true, amount: true },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  for (const entry of entries) {
    if (entry.direction === 'INCOME') totalIncome += Number(entry.amount);
    else totalExpense += Number(entry.amount);
  }

  return { totalIncome, totalExpense, net: totalIncome - totalExpense };
}

// Admin-only file access — no resident-payer branch needed, unlike LedgerEntry's
// file endpoint, since every SocietyLedgerEntry is admin-recorded and only admins
// ever touch this feature. Returns null for "not found, wrong society, or no file
// attached" (404).
export async function getSocietyLedgerEntryFileForViewing(entryId: string, societyId: string) {
  const entry = await prisma.societyLedgerEntry.findFirst({ where: { id: entryId, societyId } });
  if (!entry || !entry.fileUrl) return null;

  const stream = await getStorageAdapter().read(entry.fileUrl);
  return { stream, mimeType: entry.mimeType ?? 'application/octet-stream' };
}
