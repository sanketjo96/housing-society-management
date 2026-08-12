import { randomUUID } from 'node:crypto';
import type { LedgerType, ProofStatus, Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { ForbiddenLedgerEntryAccessError, LedgerEntryAlreadyReviewedError } from '../lib/errors';
import { getStorageAdapter } from '../lib/storage';
import { buildUpiDeepLink, generateQrDataUrl } from '../lib/upi';
import { prepareReceiptForEntry } from './receipt.service';

// LedgerEntryAlreadyReviewedError/ForbiddenLedgerEntryAccessError now live in
// lib/errors.ts (moved there for the Receipt Generation & Approval Workflow,
// 2026-08-11, to avoid a ledger.service.ts <-> receipt.service.ts import cycle) —
// re-exported here so every existing `from '../services/ledger.service'` import
// site is unaffected.
export { LedgerEntryAlreadyReviewedError, ForbiddenLedgerEntryAccessError } from '../lib/errors';

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
  approvedCredits: number;
  outstanding: number;
  availableCredit: number;
}

// The core formula: only APPROVED rows count. SYSTEM charges (MaintenanceRecord)
// are always implicitly "Approved" — every one contributes to totalCharges
// unconditionally. PENDING/REJECTED LedgerEntry rows stay visible in the resident's
// dashboard for transparency but are excluded from the running totals. Pure/DB-free
// so callers who already have the rows in hand (e.g. admin-dashboard.service.ts,
// computing every flat in a society from two bulk queries rather than N+1) can reuse
// the exact same formula without a redundant per-flat query.
//
// Credit re-introduced (2026-08-07, same day it was removed) in a different shape
// than before — see CLAUDE.md's "Credit re-introduced" addendum. It's no longer a
// separately-netted "Credit balance" (the old `Payable = Outstanding - Credit`
// split); Deposit and Credit money is simply pooled together — `outstanding`
// subtracts both, and `availableCredit` is just the *other side* of the same
// subtraction: whichever of (money owed) or (money paid in excess) is positive.
// Exactly one of `outstanding`/`availableCredit` is ever nonzero at a time.
export function balancesFromRows(
  records: { amount: unknown }[],
  entries: { type: LedgerType; status: ProofStatus; amount: unknown }[],
): FlatBalances {
  const totalCharges = records.reduce((sum, r) => sum + Number(r.amount), 0);
  const approvedDeposits = entries
    .filter((e) => e.type === 'DEPOSIT' && e.status === 'APPROVED')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const approvedCredits = entries
    .filter((e) => e.type === 'CREDIT' && e.status === 'APPROVED')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const approvedFunds = approvedDeposits + approvedCredits;
  const outstanding = Math.max(0, totalCharges - approvedFunds);
  const availableCredit = Math.max(0, approvedFunds - totalCharges);

  return { totalCharges, approvedDeposits, approvedCredits, outstanding, availableCredit };
}

export type RecordSettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

export interface RecordSettlement {
  settledAmount: number;
  status: RecordSettlementStatus;
}

// Per-record settlement, derived fresh every call rather than stored on
// MaintenanceRecord — see CLAUDE.md's settlement-tracking addendum. FIFO-fills
// `totalApprovedFunds` (one lump sum) across `records` sorted oldest-to-newest by
// period. This is deliberately order-independent of *which* individual rows
// contributed or when each was approved: filling strictly from the front always
// produces the same final per-record state for a given total, whether that total
// arrived as one payment or ten spread over months (see the worked proof in
// CLAUDE.md). That's what makes this safe to recompute from scratch on every read
// instead of mutating a stored column — there's no history to replay, only the
// current sum of approved funds and the current set of records.
//
// Since 2026-08-07's Credit re-introduction, `totalApprovedFunds` is always
// `approvedDeposits + approvedCredits` (FlatBalances) — this function itself has no
// idea Deposit vs Credit even exists, and doesn't need to: money is money once it's
// summed (see CLAUDE.md's "Credit re-introduced" addendum, and the credit spec's own
// Case 10 — "the engine doesn't care whether the ₹800 came from one source or a mix
// of payment + credit"). This is also exactly what makes Case 9 (available credit
// auto-consumed by a newly-generated record) work with no extra code: rerunning this
// same fill against a larger record set naturally lands leftover funds on the new
// record.
export function computeRecordSettlements(
  records: { id: string; period: string; amount: unknown }[],
  totalApprovedFunds: number,
): Map<string, RecordSettlement> {
  const sorted = [...records].sort((a, b) => a.period.localeCompare(b.period));
  let remainingPaise = Math.round(totalApprovedFunds * 100);
  const result = new Map<string, RecordSettlement>();
  for (const r of sorted) {
    const amountPaise = Math.round(Number(r.amount) * 100);
    const settledPaise = Math.max(0, Math.min(remainingPaise, amountPaise));
    remainingPaise -= settledPaise;
    const status: RecordSettlementStatus =
      settledPaise <= 0 ? 'UNPAID' : settledPaise >= amountPaise ? 'PAID' : 'PARTIALLY_SETTLED';
    result.set(r.id, { settledAmount: settledPaise / 100, status });
  }
  return result;
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
      select: { type: true, status: true, amount: true },
    }),
  ]);
  return balancesFromRows(records, entries);
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
  // computeRecordSettlements above). Undefined on DEPOSIT rows, which have no
  // concept of being "settled" themselves.
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

function availableYearsFromRows(records: { period: string }[], entries: { createdAt: Date }[]): number[] {
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
export async function getLedgerForResident(flatId: string, year?: number): Promise<LedgerForResident> {
  const [allRecords, allEntries] = await Promise.all([
    prisma.maintenanceRecord.findMany({ where: { flatId } }),
    prisma.ledgerEntry.findMany({ where: { flatId }, include: { receipt: { select: { id: true } } } }),
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
  const settlements = computeRecordSettlements(allRecords, totals.approvedDeposits + totals.approvedCredits);

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
        type: 'DEPOSIT',
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
        type: 'DEPOSIT',
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
export async function createCredit(payerId: string, flatId: string, societyId: string, input: CreateCreditInput) {
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

const LEDGER_ENTRY_LIST_INCLUDE = {
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
// elsewhere in this file), then the Receipt row is created in the same transaction
// as the status change so the two can never disagree.
export async function approveLedgerEntry(id: string, societyId: string, adminId: string) {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id, flat: { societyId } },
    include: { flat: { select: { wing: true, flatNumber: true } }, payer: { select: { name: true } } },
  });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const issuedAt = new Date();
  const { receiptNumber, fileKey } = await prepareReceiptForEntry(entry, entry.flat, entry.payer, society, issuedAt);

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
export async function manualDeposit(societyId: string, adminId: string, flatId: string, amount: number) {
  if (!(amount > 0)) throw new InvalidAmountError();

  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId } });
  if (!flat) return null;

  const payerId = flat.currentTenantId ?? flat.ownerId;
  const [payer, society] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: payerId }, select: { name: true } }),
    prisma.society.findUniqueOrThrow({ where: { id: societyId } }),
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
      data: { receiptNumber, fileKey, ledgerEntryId: entryId, issuedById: adminId, societyId, issuedAt },
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
