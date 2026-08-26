// SocietyLedgerEntry — "Manage Finance". A complete, already-true transaction
// record the moment it's created, not a pending-then-reviewed shape.
// Single-admin entry, immutable once created — no approval workflow. Entirely
// separate from LedgerEntry/MaintenanceRecord/OtherCharge.
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

// Shared between recordSocietyLedgerEntry (below) and the bulk-import service, so
// neither path can silently drift from the other's validation rules.
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

// categoryId is revalidated server-side against societyId + isActive. Direction
// and bank-reference rules are re-checked here too, even though Zod already
// enforces them — defense in depth.
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
// getDashboardSummary.
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

// Admin-only file access — every SocietyLedgerEntry is admin-recorded. Returns
// null for not-found/wrong-society/no-file (404).
export async function getSocietyLedgerEntryFileForViewing(entryId: string, societyId: string) {
  const entry = await prisma.societyLedgerEntry.findFirst({ where: { id: entryId, societyId } });
  if (!entry || !entry.fileUrl) return null;

  const stream = await getStorageAdapter().read(entry.fileUrl);
  return { stream, mimeType: entry.mimeType ?? 'application/octet-stream' };
}
