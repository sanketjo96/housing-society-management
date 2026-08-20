// Resident ledger actions: the Passbook read, payment-intent lock/QR/deep-link flow,
// and Deposit/Credit creation. Admin review (approve/reject/manual-deposit) lives in
// ../admin/admin-ledger-service.ts; balance/settlement formulas shared by both live
// in ../ledger-shared.ts.
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

// Neither a UPI VPA nor a complete bank-account+IFSC pair is configured on the
// society — there's nothing to show a resident trying to pay. Distinct from a
// resident-facing input error (InvalidAmountError above): this is a
// society-configuration gap the admin needs to fix, not something the resident
// did wrong.
export class PaymentMethodNotConfiguredError extends Error {
  constructor() {
    super('This society has no payment method configured yet — contact your society admin');
    this.name = 'PaymentMethodNotConfiguredError';
  }
}

// docs/other-charges/ — a resident has at most one open payment intent at a time,
// across BOTH pools (a deliberate simplification over independent per-pool intents).
// Starting a new intent while one is already open for a DIFFERENT category is
// blocked, not silently replaced — see createOrReplacePaymentIntent.
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
  // Only set on SYSTEM/OTHER_CHARGE rows — the derived per-record settlement (see
  // computeRecordSettlements, ../ledger-shared.ts). Undefined on DEPOSIT rows,
  // which have no concept of being "settled" themselves.
  settledAmount?: number;
  settlementStatus?: RecordSettlementStatus;
  // Only meaningful on DEPOSIT rows — true once a Receipt row exists (i.e. the
  // entry has been approved since the Receipt Generation & Approval Workflow
  // shipped, 2026-08-11). Lets the resident Passbook show a "Download receipt"
  // action only where one genuinely exists, rather than a failed round-trip for a
  // still-pending row or a legacy entry approved before this feature existed.
  hasReceipt?: boolean;
}

export interface LedgerForResident {
  entries: LedgerRow[];
  totals: FlatBalances;
  yearTotals: FlatBalances;
  availableYears: number[];
}

// Normalizes either charge source (MaintenanceRecord or OtherCharge) into one shape
// the rest of this function can treat uniformly — `sortKey` feeds
// computeRecordSettlements' FIFO ordering (a real 'YYYY-MM' period for maintenance;
// an ISO dueDate for Other Charges — safe here since the two pools' rows are never
// mixed into one settlement call, unlike an earlier, rejected merged design).
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

// The resident's Dashboard — charge rows (SYSTEM/OTHER_CHARGE, always "Approved")
// merged with the flat's LedgerEntry rows (Deposit/Credit, real status) for the
// SAME pool only, newest first. Never stored as a union — computed fresh from both
// tables every time. `category` (docs/other-charges/) — default MAINTENANCE, fully
// backward compatible; switches which charge table is queried and filters
// LedgerEntry to matching-category rows, never both pools in one response. `year`
// scopes the returned `entries` to a calendar year; omitted returns every row ever
// (what Maintenance Book relies on when showing full history). Two separate totals
// are returned: `totals` is always lifetime/all-time — Outstanding is current
// financial state, not a per-year concept, so it must never change just because a
// resident is browsing a different year's entries (also what a payment intent locks
// against, see createOrReplacePaymentIntent — a resident should never be able to
// underpay by switching to a smaller-year view first). `yearTotals` is scoped to
// `year` (or equal to `totals` when `year` is omitted) — used for numbers that
// *are* naturally "sum over a period," e.g. the Dashboard's "Total Paid (year)" row.
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

  // Always derived from the *lifetime* charge set and the *lifetime* approved
  // deposits (never the year-filtered arrays) — a record's settlement depends on
  // its position in the flat's full oldest-to-newest history, not on whichever
  // year the resident happens to be browsing.
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

// Powers the Dashboard's 4 summary cards (Maintenance Outstanding, Available
// Credit, Other Outstanding, Total Outstanding) in one cheap call — deliberately
// NOT built on getLedgerForResident, which computes full entries/settlement for a
// use case that only needs 2 numbers. docs/other-charges/.
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
  // docs/other-charges/ — which pool this intent is locked against. Lets a page for
  // the OTHER pool tell "there's an open intent, but it's for Maintenance" apart
  // from "there's an open intent for me" without a second round-trip.
  category: LedgerCategory;
}

// UPI always takes precedence when configured (CLAUDE.md's payment-method rule) —
// bank details are only ever surfaced when the society has no UPI VPA set. Throws
// PaymentMethodNotConfiguredError if neither is usable, rather than returning a
// result with nothing a resident could actually act on.
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

// Re-derives the QR/UPI link fresh every call rather than storing them on the row —
// they're cheap/deterministic from `amount` alone, so there's nothing to keep in
// sync, and a resident revisiting a QR on a later day still gets a valid one.
//
// `flat: { societyId }` on every query below (Phase 9 security-audit
// defense-in-depth, 2026-08-12) — PaymentIntent has no direct societyId column of
// its own, only via its Flat relation, and every caller today already pre-validates
// `flatId` against the caller's own society (resident-ledger-controller.ts's
// resolveMyFlatId), so this filter is currently unreachable-but-inert. It's added
// anyway so a future caller that ever passes a client-supplied flatId straight
// through without going via resolveMyFlatId first fails safe (empty result) rather
// than silently reading/mutating a different society's pending payment.
export async function getOpenPaymentIntent(
  flatId: string,
  societyId: string,
): Promise<PaymentIntentResult | null> {
  const intent = await prisma.paymentIntent.findUnique({ where: { flatId, flat: { societyId } } });
  if (!intent) return null;
  return buildPaymentIntentResult(intent, societyId);
}

// "Amount locked" — one open intent per flat (`flatId` unique), replaced wholesale
// if the resident starts over with a different amount for the SAME category before
// submitting. A different category is BLOCKED instead (docs/other-charges/ — at
// most one open intent at a time, across both pools, a deliberate simplification
// over independent per-pool intents). No longer capped at the flat's outstanding
// (2026-08-20 pivot) — a resident may lock any positive amount; any part beyond
// Outstanding settles it in full and the remainder surfaces as Available Credit
// once approved, via the same balancesFromRows formula (../ledger-shared.ts).
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

// Finalizes an open intent into a real, reviewable Deposit — same shape as
// `createDeposit` below (transaction creating the LedgerEntry + audit log), plus
// clearing the intent row in the same transaction ("intent clears" on submit). File
// is required here (unlike the lower-level `createDeposit` below) — the whole point
// of the intent flow is "come back once you have a screenshot".
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
        // Self-service — the resident submitting this is also the creator.
        createdById: payerId,
        createdByType: role,
        // Inherited from the intent being finalized — never re-derived, so the
        // resulting Deposit always settles the exact pool the resident locked
        // against (docs/other-charges/).
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

// Proof file is optional here (deliberate reversal of the pre-pivot mandatory-proof
// rule — see CLAUDE.md's ledger pivot note): the resident-experience mockup's "Upload
// payment proof" button in the Pay panel has no wired behavior, and the written spec
// for Pay only requires the amount field. `category` trails as a defaulted param
// (not inserted before `input`) so every existing call site stays valid unchanged.
// No longer capped at Outstanding (2026-08-20 pivot) — see createOrReplacePaymentIntent.
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
