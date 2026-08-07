import type { ProofStatus, Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { getStorageAdapter } from '../lib/storage';
import { buildUpiDeepLink, generateQrDataUrl } from '../lib/upi';

// Domain errors specific to the ledger flow — co-located here rather than
// lib/errors.ts, matching flats.service.ts/payment-proofs.service.ts's precedent.
export class LedgerEntryAlreadyReviewedError extends Error {
  constructor() {
    super('This ledger entry has already been reviewed');
    this.name = 'LedgerEntryAlreadyReviewedError';
  }
}

export class ForbiddenLedgerEntryAccessError extends Error {
  constructor() {
    super('You do not have access to this ledger entry');
    this.name = 'ForbiddenLedgerEntryAccessError';
  }
}

export class InvalidDepositAmountError extends Error {
  constructor(public readonly outstanding: number) {
    super(`Amount must be greater than 0 and at most the current outstanding amount (${outstanding})`);
    this.name = 'InvalidDepositAmountError';
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super('Amount must be greater than 0');
    this.name = 'InvalidAmountError';
  }
}

export class NoOpenPaymentIntentError extends Error {
  constructor() {
    super('No pending payment to submit');
    this.name = 'NoOpenPaymentIntentError';
  }
}

export interface FlatBalances {
  totalCharges: number;
  approvedDeposits: number;
  outstanding: number;
}

// The core formula: only APPROVED Deposits count. SYSTEM charges (MaintenanceRecord)
// are always implicitly "Approved" — every one contributes to totalCharges
// unconditionally. PENDING/REJECTED LedgerEntry rows stay visible in the resident's
// dashboard for transparency but are excluded from the running total. Pure/DB-free
// so callers who already have the rows in hand (e.g. admin-dashboard.service.ts,
// computing every flat in a society from two bulk queries rather than N+1) can reuse
// the exact same formula without a redundant per-flat query. Credit was removed
// from this system entirely (2026-08-07) — there is no separate "Payable" anymore,
// Outstanding is directly the amount due.
export function balancesFromRows(
  records: { amount: unknown }[],
  entries: { status: ProofStatus; amount: unknown }[],
): FlatBalances {
  const totalCharges = records.reduce((sum, r) => sum + Number(r.amount), 0);
  const approvedDeposits = entries
    .filter((e) => e.status === 'APPROVED')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const outstanding = Math.max(0, totalCharges - approvedDeposits);

  return { totalCharges, approvedDeposits, outstanding };
}

function maintenanceRecordYearFilter(year?: number) {
  return year ? { period: { startsWith: `${year}-` } } : {};
}

function ledgerEntryYearFilter(year?: number) {
  return year ? { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {};
}

// `year` scopes both sides of the formula to a calendar year (MaintenanceRecord by
// its `period`'s year, LedgerEntry by `createdAt`'s year) — used wherever a
// resident is acting against the balance shown for a specific year on their
// Dashboard (creating a payment intent, etc). Omitted = the original all-time
// behavior, still used by admin-dashboard.service.ts's bulk per-flat calc.
export async function computeFlatBalances(flatId: string, year?: number): Promise<FlatBalances> {
  const [records, entries] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where: { flatId, ...maintenanceRecordYearFilter(year) },
      select: { amount: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { flatId, ...ledgerEntryYearFilter(year) },
      select: { status: true, amount: true },
    }),
  ]);
  return balancesFromRows(records, entries);
}

export interface LedgerRow {
  id: string;
  type: 'SYSTEM' | 'DEPOSIT';
  period?: string;
  date: string;
  payer: string;
  amount: number;
  status: 'APPROVED' | ProofStatus;
  note?: string | null;
}

export interface LedgerForResident {
  entries: LedgerRow[];
  totals: FlatBalances;
  yearTotals: FlatBalances;
  availableYears: number[];
}

function availableYearsFromRows(records: { period: string }[], entries: { createdAt: Date }[]): number[] {
  const years = new Set<number>();
  for (const r of records) years.add(Number(r.period.split('-')[0]));
  for (const e of entries) years.add(e.createdAt.getFullYear());
  return [...years].sort((a, b) => b - a);
}

// The resident's Dashboard — MaintenanceRecord rows (SYSTEM, always "Approved")
// merged with the flat's LedgerEntry rows (Deposit, real status), newest first.
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
export async function getLedgerForResident(flatId: string, year?: number): Promise<LedgerForResident> {
  const [allRecords, allEntries] = await Promise.all([
    prisma.maintenanceRecord.findMany({ where: { flatId } }),
    prisma.ledgerEntry.findMany({ where: { flatId } }),
  ]);

  const records = year ? allRecords.filter((r) => r.period.startsWith(`${year}-`)) : allRecords;
  const entries = year ? allEntries.filter((e) => e.createdAt.getFullYear() === year) : allEntries;

  const totals = balancesFromRows(allRecords, allEntries);
  const yearTotals = year ? balancesFromRows(records, entries) : totals;
  const availableYears = availableYearsFromRows(allRecords, allEntries);

  const systemRows: LedgerRow[] = records.map((r) => {
    const [recordYear, recordMonth] = r.period.split('-').map(Number);
    return {
      id: r.id,
      type: 'SYSTEM',
      period: r.period,
      date: new Date(recordYear, recordMonth - 1, 1).toISOString(),
      payer: r.payerType === 'OWNER' ? 'Owner' : 'Tenant',
      amount: Number(r.amount),
      status: 'APPROVED',
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
  }));

  const merged = [...systemRows, ...ledgerRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return { entries: merged, totals, yearTotals, availableYears };
}

export interface PaymentIntentResult {
  id: string;
  amount: number;
  upiLink: string;
  qrDataUrl: string;
  createdAt: string;
}

async function buildPaymentIntentResult(
  intent: { id: string; amount: unknown; createdAt: Date },
  societyId: string,
): Promise<PaymentIntentResult> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const amount = Number(intent.amount);
  const upiLink = buildUpiDeepLink({ vpa: society.upiVpa, payeeName: society.name, amount, note: 'Maintenance deposit' });
  const qrDataUrl = await generateQrDataUrl(upiLink);
  return { id: intent.id, amount, upiLink, qrDataUrl, createdAt: intent.createdAt.toISOString() };
}

// Re-derives the QR/UPI link fresh every call rather than storing them on the row —
// they're cheap/deterministic from `amount` alone, so there's nothing to keep in
// sync, and a resident revisiting a QR on a later day still gets a valid one.
export async function getOpenPaymentIntent(flatId: string, societyId: string): Promise<PaymentIntentResult | null> {
  const intent = await prisma.paymentIntent.findUnique({ where: { flatId } });
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
  if (!(amount > 0) || amount > balances.outstanding) throw new InvalidDepositAmountError(balances.outstanding);

  const intent = await prisma.paymentIntent.upsert({
    where: { flatId },
    create: { flatId, payerId, amount },
    update: { payerId, amount, createdAt: new Date() },
  });
  return buildPaymentIntentResult(intent, societyId);
}

export async function cancelPaymentIntent(flatId: string): Promise<void> {
  await prisma.paymentIntent.deleteMany({ where: { flatId } });
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
  file: ProofFileInput,
): Promise<unknown> {
  const intent = await prisma.paymentIntent.findUnique({ where: { flatId } });
  if (!intent) throw new NoOpenPaymentIntentError();

  const saved = await getStorageAdapter().save({ buffer: file.buffer, societyId, extension: file.extension });

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

interface ProofFileInput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export interface CreateDepositInput {
  amount: number;
  file?: ProofFileInput;
}

// Proof file is optional here (deliberate reversal of the pre-pivot mandatory-proof
// rule — see CLAUDE.md's ledger pivot note): the resident-experience mockup's "Upload
// payment proof" button in the Pay panel has no wired behavior, and the written spec
// for Pay only requires the amount field.
export async function createDeposit(payerId: string, flatId: string, societyId: string, input: CreateDepositInput) {
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
        status: 'PENDING',
        amount: input.amount,
        note: 'UPI payment - awaiting review',
        fileUrl,
        mimeType,
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

const LEDGER_ENTRY_LIST_INCLUDE = {
  payer: { select: { id: true, name: true, email: true } },
  flat: { select: { id: true, wing: true, flatNumber: true } },
} as const;

// Admin review queue — optionally filtered by status (defaults to every entry,
// though the frontend queue only ever asks for PENDING).
export async function listPendingLedgerEntries(societyId: string, filters: { status?: ProofStatus } = {}) {
  return prisma.ledgerEntry.findMany({
    where: {
      flat: { societyId },
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: LEDGER_ENTRY_LIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

// Approve/reject a single LedgerEntry row directly — much simpler than the pre-pivot
// PaymentProof flow, since a Deposit is never linked to specific MaintenanceRecords
// (payment is against the aggregate balance).
export async function approveLedgerEntry(id: string, societyId: string, adminId: string) {
  const entry = await prisma.ledgerEntry.findFirst({ where: { id, flat: { societyId } } });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'APPROVE_DEPOSIT',
        entityType: 'LedgerEntry',
        entityId: id,
        note: `Amount ${entry.amount}`,
      },
    });
    return updated;
  });
}

export async function rejectLedgerEntry(id: string, societyId: string, adminId: string, reason?: string) {
  const entry = await prisma.ledgerEntry.findFirst({ where: { id, flat: { societyId } } });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), adminNote: reason },
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
export async function manualDeposit(societyId: string, adminId: string, flatId: string, amount: number) {
  if (!(amount > 0)) throw new InvalidAmountError();

  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId } });
  if (!flat) return null;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        flatId,
        payerId: flat.currentTenantId ?? flat.ownerId,
        status: 'APPROVED',
        amount,
        note: 'Manual deposit (cash/bank transfer)',
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: LEDGER_ENTRY_LIST_INCLUDE,
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'MANUAL_MARK_PAID',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        note: `Amount ${amount}`,
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
