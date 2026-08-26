// Resident ledger actions: the Passbook read, payment-intent lock/QR/deep-link flow,
// and Deposit creation. Admin review lives in ../admin/admin-ledger-service.ts.
import { prisma } from '../../../infrastructure/prisma/client';
import type {
  LedgerCategory,
  ProofStatus,
  Role,
} from '../../../infrastructure/prisma/generated/client';
import { ForbiddenLedgerEntryAccessError } from '../../../shared/errors/errors';
import { getStorageAdapter } from '../../../infrastructure/storage';
import { buildUpiDeepLink, generateQrDataUrl } from '../../../shared/billing/upi';
import {
  balancesFromRows,
  computeFlatBalances,
  computeRecordSettlements,
  InvalidAmountError,
  type FlatBalances,
  type RecordSettlementStatus,
} from '../ledger-shared';

export { ForbiddenLedgerEntryAccessError, InvalidAmountError };

export class NoOpenPaymentIntentError extends Error {
  constructor() {
    super('No pending payment to submit');
    this.name = 'NoOpenPaymentIntentError';
  }
}

// Neither a UPI VPA nor a complete bank-account+IFSC pair is configured — a
// society-configuration gap, not a resident input error.
export class PaymentMethodNotConfiguredError extends Error {
  constructor() {
    super('This society has no payment method configured yet — contact your society admin');
    this.name = 'PaymentMethodNotConfiguredError';
  }
}

// At most one open payment intent per flat, across both Maintenance and Other
// Charges. Starting a new intent while one is open for a different category is
// blocked, not silently replaced.
export class IntentAlreadyOpenForOtherCategoryError extends Error {
  constructor(public readonly openCategory: LedgerCategory) {
    super(
      `You have a pending payment for ${openCategory === 'MAINTENANCE' ? 'Maintenance' : 'Other Charges'} — finish or cancel it before starting a new one`,
    );
    this.name = 'IntentAlreadyOpenForOtherCategoryError';
  }
}

export interface LedgerRow {
  id: string;
  type: 'SYSTEM' | 'OTHER_CHARGE' | 'DEPOSIT';
  period?: string;
  // Only set on OTHER_CHARGE rows — which fee type this charge is.
  feeTypeName?: string;
  date: string;
  payer: string;
  amount: number;
  status: 'APPROVED' | ProofStatus;
  note?: string | null;
  // Only set on SYSTEM/OTHER_CHARGE rows — the derived per-record settlement.
  settledAmount?: number;
  settlementStatus?: RecordSettlementStatus;
  // Only meaningful on DEPOSIT rows — true once a Receipt row exists.
  hasReceipt?: boolean;
}

export interface LedgerForResident {
  entries: LedgerRow[];
  totals: FlatBalances;
  yearTotals: FlatBalances;
  availableYears: number[];
}

// Normalizes either charge source (MaintenanceRecord or OtherCharge) into one shape.
// `sortKey` feeds computeRecordSettlements' FIFO ordering: a 'YYYY-MM' period for
// maintenance, an ISO dueDate for Other Charges — the two pools are never mixed
// into one settlement call.
interface NormalizedCharge {
  id: string;
  amount: unknown;
  sortKey: string;
  year: number;
  date: string;
  payer: string;
  period?: string;
  feeTypeName?: string;
}

async function fetchNormalizedCharges(
  flatId: string,
  category: LedgerCategory,
): Promise<NormalizedCharge[]> {
  if (category === 'MAINTENANCE') {
    const records = await prisma.maintenanceRecord.findMany({ where: { flatId } });
    return records.map((r) => {
      const [year, month] = r.period.split('-').map(Number);
      return {
        id: r.id,
        amount: r.amount,
        sortKey: r.period,
        year,
        date: new Date(year, month - 1, 1).toISOString(),
        payer: r.payerType === 'OWNER' ? 'Owner' : 'Tenant',
        period: r.period,
      };
    });
  }

  const charges = await prisma.otherCharge.findMany({
    where: { flatId },
    include: { feeType: { select: { name: true } } },
  });
  return charges.map((c) => ({
    id: c.id,
    amount: c.amount,
    sortKey: c.dueDate.toISOString(),
    year: c.createdAt.getFullYear(),
    date: c.createdAt.toISOString(),
    payer: 'Owner',
    feeTypeName: c.feeType.name,
  }));
}

// The resident's Dashboard — charge rows merged with the flat's LedgerEntry
// (Deposit) rows for the same pool, newest first, computed fresh every call.
// `category` selects which pool. `year` scopes the returned `entries` and
// `yearTotals`; `totals` always stays lifetime — Outstanding is current financial
// state, not a per-year concept, and is what a payment intent locks against.
export async function getLedgerForResident(
  flatId: string,
  category: LedgerCategory = 'MAINTENANCE',
  year?: number,
): Promise<LedgerForResident> {
  const [allCharges, allEntries] = await Promise.all([
    fetchNormalizedCharges(flatId, category),
    prisma.ledgerEntry.findMany({
      where: { flatId, category },
      include: { receipt: { select: { id: true } } },
    }),
  ]);

  const charges = year ? allCharges.filter((c) => c.year === year) : allCharges;
  const entries = year ? allEntries.filter((e) => e.createdAt.getFullYear() === year) : allEntries;

  const totals = balancesFromRows(allCharges, allEntries);
  const yearTotals = year ? balancesFromRows(charges, entries) : totals;
  const availableYears = [
    ...new Set([...allCharges.map((c) => c.year), ...allEntries.map((e) => e.createdAt.getFullYear())]),
  ].sort((a, b) => b - a);

  // Always derived from the lifetime charge set, never the year-filtered arrays —
  // settlement depends on full oldest-to-newest history, not the browsed year.
  const settlements = computeRecordSettlements(
    allCharges.map((c) => ({ id: c.id, period: c.sortKey, amount: c.amount })),
    totals.approvedDeposits,
  );

  const rowType: 'SYSTEM' | 'OTHER_CHARGE' = category === 'MAINTENANCE' ? 'SYSTEM' : 'OTHER_CHARGE';
  const chargeRows: LedgerRow[] = charges.map((c) => {
    const settlement = settlements.get(c.id);
    return {
      id: c.id,
      type: rowType,
      period: c.period,
      feeTypeName: c.feeTypeName,
      date: c.date,
      payer: c.payer,
      amount: Number(c.amount),
      status: 'APPROVED',
      settledAmount: settlement?.settledAmount ?? 0,
      settlementStatus: settlement?.status ?? 'UNPAID',
    };
  });

  const ledgerRows: LedgerRow[] = entries.map((e) => ({
    id: e.id,
    type: 'DEPOSIT',
    date: e.createdAt.toISOString(),
    payer: 'You',
    amount: Number(e.amount),
    status: e.status,
    note: e.note,
    hasReceipt: !!e.receipt,
  }));

  const merged = [...chargeRows, ...ledgerRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return { entries: merged, totals, yearTotals, availableYears };
}

export interface ResidentBalancesSummary {
  maintenance: FlatBalances;
  otherCharges: FlatBalances;
  totalOutstanding: number;
}

// Powers the Dashboard's 4 summary cards in one cheap call — not built on
// getLedgerForResident, which computes far more than these 2 numbers need.
export async function getResidentBalancesSummary(flatId: string): Promise<ResidentBalancesSummary> {
  const [maintenance, otherCharges] = await Promise.all([
    computeFlatBalances(flatId),
    computeFlatBalances(flatId, undefined, 'OTHER_CHARGE'),
  ]);
  return {
    maintenance,
    otherCharges,
    totalOutstanding: maintenance.outstanding + otherCharges.outstanding,
  };
}

export interface PaymentIntentResult {
  id: string;
  amount: number;
  paymentMethod: 'UPI' | 'BANK_TRANSFER';
  // Set only when paymentMethod is 'UPI'.
  upiLink?: string;
  qrDataUrl?: string;
  // Set only when paymentMethod is 'BANK_TRANSFER'.
  bankAccountNumber?: string;
  bankIfsc?: string;
  createdAt: string;
  // Which pool this intent is locked against.
  category: LedgerCategory;
}

// UPI always takes precedence when configured; bank details only surface when the
// society has no UPI VPA set. Throws PaymentMethodNotConfiguredError if neither is
// usable.
async function buildPaymentIntentResult(
  intent: { id: string; amount: unknown; createdAt: Date; category: LedgerCategory },
  societyId: string,
): Promise<PaymentIntentResult> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const amount = Number(intent.amount);
  const base = {
    id: intent.id,
    amount,
    createdAt: intent.createdAt.toISOString(),
    category: intent.category,
  };

  if (society.upiVpa) {
    const upiLink = buildUpiDeepLink({
      vpa: society.upiVpa,
      payeeName: society.name,
      amount,
      note: 'Maintenance deposit',
    });
    const qrDataUrl = await generateQrDataUrl(upiLink);
    return { ...base, paymentMethod: 'UPI', upiLink, qrDataUrl };
  }

  if (society.bankAccountNumber && society.bankIfsc) {
    return {
      ...base,
      paymentMethod: 'BANK_TRANSFER',
      bankAccountNumber: society.bankAccountNumber,
      bankIfsc: society.bankIfsc,
    };
  }

  throw new PaymentMethodNotConfiguredError();
}

// Re-derives the QR/UPI link fresh every call rather than storing it — cheap and
// deterministic from `amount` alone. `flat: { societyId }` on every query below is
// defense-in-depth: PaymentIntent has no direct societyId column, only via Flat.
export async function getOpenPaymentIntent(
  flatId: string,
  societyId: string,
): Promise<PaymentIntentResult | null> {
  const intent = await prisma.paymentIntent.findUnique({ where: { flatId, flat: { societyId } } });
  if (!intent) return null;
  return buildPaymentIntentResult(intent, societyId);
}

// One open intent per flat, replaced wholesale if the resident re-locks a different
// amount for the same category before submitting; a different category is blocked
// instead. Any positive amount is allowed — an amount beyond Outstanding settles it
// in full and the remainder surfaces as Available Credit once approved.
export async function createOrReplacePaymentIntent(
  flatId: string,
  payerId: string,
  societyId: string,
  amount: number,
  category: LedgerCategory = 'MAINTENANCE',
): Promise<PaymentIntentResult> {
  if (!(amount > 0)) throw new InvalidAmountError();

  const existing = await prisma.paymentIntent.findUnique({ where: { flatId, flat: { societyId } } });
  if (existing && existing.category !== category) {
    throw new IntentAlreadyOpenForOtherCategoryError(existing.category);
  }

  const intent = await prisma.paymentIntent.upsert({
    where: { flatId, flat: { societyId } },
    create: { flatId, payerId, amount, category },
    update: { payerId, amount, category, createdAt: new Date() },
  });
  return buildPaymentIntentResult(intent, societyId);
}

export async function cancelPaymentIntent(flatId: string, societyId: string): Promise<void> {
  await prisma.paymentIntent.deleteMany({ where: { flatId, flat: { societyId } } });
}

interface ProofFileInput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

// Finalizes an open intent into a real, reviewable Deposit, clearing the intent row
// in the same transaction. File is required here, unlike createDeposit below.
export async function submitPaymentIntent(
  flatId: string,
  payerId: string,
  societyId: string,
  role: 'OWNER' | 'TENANT',
  file: ProofFileInput,
): Promise<unknown> {
  const intent = await prisma.paymentIntent.findUnique({ where: { flatId, flat: { societyId } } });
  if (!intent) throw new NoOpenPaymentIntentError();

  const saved = await getStorageAdapter().save({
    buffer: file.buffer,
    societyId,
    extension: file.extension,
  });

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        flatId,
        payerId,
        status: 'PENDING',
        amount: intent.amount,
        note: 'UPI payment - awaiting review',
        fileUrl: saved.key,
        mimeType: file.mimeType,
        createdById: payerId,
        createdByType: role,
        // Inherited from the intent, never re-derived.
        category: intent.category,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: payerId,
        action: 'SUBMIT_DEPOSIT',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        note: `Deposit of ${intent.amount}`,
      },
    });
    await tx.paymentIntent.delete({ where: { flatId } });
    return entry;
  });
}

export interface CreateDepositInput {
  amount: number;
  file?: ProofFileInput;
}

// Proof file is optional here. No amount cap against Outstanding.
export async function createDeposit(
  payerId: string,
  flatId: string,
  societyId: string,
  role: 'OWNER' | 'TENANT',
  input: CreateDepositInput,
  category: LedgerCategory = 'MAINTENANCE',
) {
  if (!(input.amount > 0)) throw new InvalidAmountError();

  let fileUrl: string | undefined;
  let mimeType: string | undefined;
  if (input.file) {
    const saved = await getStorageAdapter().save({
      buffer: input.file.buffer,
      societyId,
      extension: input.file.extension,
    });
    fileUrl = saved.key;
    mimeType = input.file.mimeType;
  }

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        flatId,
        payerId,
        status: 'PENDING',
        amount: input.amount,
        note: 'UPI payment - awaiting review',
        fileUrl,
        mimeType,
        createdById: payerId,
        createdByType: role,
        category,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: payerId,
        action: 'SUBMIT_DEPOSIT',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        note: `Deposit of ${input.amount}`,
      },
    });
    return entry;
  });
}

// Authenticated file access, never public — admin or the entry's own payer. Returns
// null for "not found, wrong society, or no file attached" (404); throws
// ForbiddenLedgerEntryAccessError for "found, but not this resident's own entry and
// the requester isn't an admin" (403).
export async function getLedgerEntryFileForViewing(
  entryId: string,
  requesterId: string,
  requesterRole: Role,
  societyId: string,
) {
  const entry = await prisma.ledgerEntry.findFirst({ where: { id: entryId, flat: { societyId } } });
  if (!entry || !entry.fileUrl) return null;

  if (requesterRole !== 'ADMIN' && entry.payerId !== requesterId) {
    throw new ForbiddenLedgerEntryAccessError();
  }

  const stream = await getStorageAdapter().read(entry.fileUrl);
  return { stream, mimeType: entry.mimeType ?? 'application/octet-stream' };
}
