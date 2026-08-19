// Resident ledger actions: the Passbook read, payment-intent lock/QR/deep-link flow,
// and Deposit/Credit creation. Admin review (approve/reject/manual-deposit) lives in
// ../admin/admin-ledger-service.ts; balance/settlement formulas shared by both live
// in ../ledger-shared.ts.
import { prisma } from '../../../infrastructure/prisma/client';
import type { LedgerType, ProofStatus, Role } from '../../../infrastructure/prisma/generated/client';
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

export class InvalidDepositAmountError extends Error {
  constructor(public readonly outstanding: number) {
    super(
      `Amount must be greater than 0 and at most the current outstanding amount (${outstanding})`,
    );
    this.name = 'InvalidDepositAmountError';
  }
}

export class NoOpenPaymentIntentError extends Error {
  constructor() {
    super('No pending payment to submit');
    this.name = 'NoOpenPaymentIntentError';
  }
}

// Neither a UPI VPA nor a complete bank-account+IFSC pair is configured on the
// society — there's nothing to show a resident trying to pay. Distinct from a
// resident-facing input error (InvalidDepositAmountError/InvalidAmountError
// above): this is a society-configuration gap the admin needs to fix, not
// something the resident did wrong.
export class PaymentMethodNotConfiguredError extends Error {
  constructor() {
    super('This society has no payment method configured yet — contact your society admin');
    this.name = 'PaymentMethodNotConfiguredError';
  }
}

export interface LedgerRow {
  id: string;
  type: 'SYSTEM' | LedgerType;
  period?: string;
  date: string;
  payer: string;
  amount: number;
  status: 'APPROVED' | ProofStatus;
  note?: string | null;
  // Only set on SYSTEM rows — the derived per-record settlement (see
  // computeRecordSettlements, ../ledger-shared.ts). Undefined on DEPOSIT rows, which
  // have no concept of being "settled" themselves.
  settledAmount?: number;
  settlementStatus?: RecordSettlementStatus;
  // Only meaningful on DEPOSIT/CREDIT rows — true once a Receipt row exists (i.e.
  // the entry has been approved since the Receipt Generation & Approval Workflow
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

function availableYearsFromRows(
  records: { period: string }[],
  entries: { createdAt: Date }[],
): number[] {
  const years = new Set<number>();
  for (const r of records) years.add(Number(r.period.split('-')[0]));
  for (const e of entries) years.add(e.createdAt.getFullYear());
  return [...years].sort((a, b) => b - a);
}

// The resident's Dashboard — MaintenanceRecord rows (SYSTEM, always "Approved")
// merged with the flat's LedgerEntry rows (Deposit/Credit, real status), newest first.
// Never stored as a union — computed fresh from both tables every time. `year`
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
  year?: number,
): Promise<LedgerForResident> {
  const [allRecords, allEntries] = await Promise.all([
    prisma.maintenanceRecord.findMany({ where: { flatId } }),
    prisma.ledgerEntry.findMany({
      where: { flatId },
      include: { receipt: { select: { id: true } } },
    }),
  ]);

  const records = year ? allRecords.filter((r) => r.period.startsWith(`${year}-`)) : allRecords;
  const entries = year ? allEntries.filter((e) => e.createdAt.getFullYear() === year) : allEntries;

  const totals = balancesFromRows(allRecords, allEntries);
  const yearTotals = year ? balancesFromRows(records, entries) : totals;
  const availableYears = availableYearsFromRows(allRecords, allEntries);

  // Always derived from the *lifetime* record set and the *lifetime* approved funds
  // (deposits + credits — never the year-filtered `records`/`yearTotals`) — a
  // record's settlement depends on its position in the flat's full oldest-to-newest
  // history, not on whichever year the resident happens to be browsing.
  const settlements = computeRecordSettlements(
    allRecords,
    totals.approvedDeposits + totals.approvedCredits,
  );

  const systemRows: LedgerRow[] = records.map((r) => {
    const [recordYear, recordMonth] = r.period.split('-').map(Number);
    const settlement = settlements.get(r.id);
    return {
      id: r.id,
      type: 'SYSTEM',
      period: r.period,
      date: new Date(recordYear, recordMonth - 1, 1).toISOString(),
      payer: r.payerType === 'OWNER' ? 'Owner' : 'Tenant',
      amount: Number(r.amount),
      status: 'APPROVED',
      settledAmount: settlement?.settledAmount ?? 0,
      settlementStatus: settlement?.status ?? 'UNPAID',
    };
  });

  const ledgerRows: LedgerRow[] = entries.map((e) => ({
    id: e.id,
    type: e.type,
    date: e.createdAt.toISOString(),
    payer: 'You',
    amount: Number(e.amount),
    status: e.status,
    note: e.note,
    hasReceipt: !!e.receipt,
  }));

  const merged = [...systemRows, ...ledgerRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return { entries: merged, totals, yearTotals, availableYears };
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
}

// UPI always takes precedence when configured (CLAUDE.md's payment-method rule) —
// bank details are only ever surfaced when the society has no UPI VPA set. Throws
// PaymentMethodNotConfiguredError if neither is usable, rather than returning a
// result with nothing a resident could actually act on.
async function buildPaymentIntentResult(
  intent: { id: string; amount: unknown; createdAt: Date },
  societyId: string,
): Promise<PaymentIntentResult> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const amount = Number(intent.amount);
  const base = { id: intent.id, amount, createdAt: intent.createdAt.toISOString() };

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
// if the resident starts over with a different amount before submitting. Always
// caps against the flat's lifetime outstanding (never a year-scoped one) —
// Outstanding is current financial state, not a per-year concept, so a resident
// can't underpay by switching to a smaller-year view before tapping Pay.
export async function createOrReplacePaymentIntent(
  flatId: string,
  payerId: string,
  societyId: string,
  amount: number,
): Promise<PaymentIntentResult> {
  const balances = await computeFlatBalances(flatId);
  if (!(amount > 0) || amount > balances.outstanding)
    throw new InvalidDepositAmountError(balances.outstanding);

  const intent = await prisma.paymentIntent.upsert({
    where: { flatId, flat: { societyId } },
    create: { flatId, payerId, amount },
    update: { payerId, amount, createdAt: new Date() },
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
        type: 'DEPOSIT',
        status: 'PENDING',
        amount: intent.amount,
        note: 'UPI payment - awaiting review',
        fileUrl: saved.key,
        mimeType: file.mimeType,
        // Self-service — the resident submitting this is also the creator.
        createdById: payerId,
        createdByType: role,
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
// for Pay only requires the amount field.
export async function createDeposit(
  payerId: string,
  flatId: string,
  societyId: string,
  role: 'OWNER' | 'TENANT',
  input: CreateDepositInput,
) {
  const balances = await computeFlatBalances(flatId);
  if (!(input.amount > 0) || input.amount > balances.outstanding) {
    throw new InvalidDepositAmountError(balances.outstanding);
  }

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
        type: 'DEPOSIT',
        status: 'PENDING',
        amount: input.amount,
        note: 'UPI payment - awaiting review',
        fileUrl,
        mimeType,
        createdById: payerId,
        createdByType: role,
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

export interface CreateCreditInput {
  amount: number;
  note: string;
  file: ProofFileInput;
}

// Credit re-introduced (2026-08-07) — a committee-approved adjustment (e.g. a repair
// cost the owner wants settled against maintenance), resident-submitted like a
// Deposit but validated differently: `amount > 0` only, **not** capped at Outstanding
// (a resident can request more credit than they currently owe — the excess becomes
// availableCredit once approved, see balancesFromRows). `note` is required — unlike a
// Deposit's amount+screenshot (self-explanatory), an arbitrary discretionary
// adjustment needs a reason for the committee to actually evaluate it. **`file` is
// also required** (2026-08-07, later same day) — unlike a Deposit's optional
// screenshot, a Credit's proof (receipt, invoice, photo of the repair) is the
// committee's only independent evidence for an amount that isn't otherwise
// verifiable the way a UPI payment is. Starts PENDING, with zero effect on any
// balance until an admin approves it (rule: a pending credit request never moves
// Outstanding/availableCredit).
export async function createCredit(
  payerId: string,
  flatId: string,
  societyId: string,
  role: 'OWNER' | 'TENANT',
  input: CreateCreditInput,
) {
  if (!(input.amount > 0)) throw new InvalidAmountError();

  const saved = await getStorageAdapter().save({
    buffer: input.file.buffer,
    societyId,
    extension: input.file.extension,
  });

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        flatId,
        payerId,
        type: 'CREDIT',
        status: 'PENDING',
        amount: input.amount,
        note: input.note,
        fileUrl: saved.key,
        mimeType: input.file.mimeType,
        createdById: payerId,
        createdByType: role,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: payerId,
        action: 'SUBMIT_CREDIT',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        note: input.note,
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
