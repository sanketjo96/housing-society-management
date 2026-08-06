import type { LedgerType, ProofStatus, Role } from '../generated/prisma/client';
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
  constructor(public readonly payable: number) {
    super(`Amount must be greater than 0 and at most the current payable amount (${payable})`);
    this.name = 'InvalidDepositAmountError';
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super('Amount must be greater than 0');
    this.name = 'InvalidAmountError';
  }
}

export interface FlatBalances {
  totalCharges: number;
  approvedDeposits: number;
  approvedCredits: number;
  outstanding: number;
  creditBalance: number;
  payable: number;
}

// The ledger pivot's core formula (exact match to the resident-experience mockup's
// PassbookTab): only APPROVED rows count. SYSTEM charges (MaintenanceRecord) are
// always implicitly "Approved" — every one contributes to totalCharges unconditionally.
// PENDING/REJECTED LedgerEntry rows stay visible in the resident's passbook for
// transparency but are excluded from all three running numbers (CLAUDE.md's ledger
// pivot note). Pure/DB-free so callers who already have the rows in hand (e.g.
// admin-dashboard.service.ts, computing every flat in a society from two bulk queries
// rather than N+1) can reuse the exact same formula without a redundant per-flat query.
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

  const outstanding = Math.max(0, totalCharges - approvedDeposits);
  const creditBalance = approvedCredits;
  const payable = Math.max(0, outstanding - creditBalance);

  return { totalCharges, approvedDeposits, approvedCredits, outstanding, creditBalance, payable };
}

export async function computeFlatBalances(flatId: string): Promise<FlatBalances> {
  const [records, entries] = await Promise.all([
    prisma.maintenanceRecord.findMany({ where: { flatId }, select: { amount: true } }),
    prisma.ledgerEntry.findMany({ where: { flatId }, select: { type: true, status: true, amount: true } }),
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
}

export interface LedgerForResident {
  entries: LedgerRow[];
  totals: FlatBalances;
}

// The resident's Passbook — MaintenanceRecord rows (SYSTEM, always "Approved") merged
// with the flat's LedgerEntry rows (Deposit/Credit, real status), newest first. Never
// stored as a union — computed fresh from both tables every time.
export async function getLedgerForResident(flatId: string): Promise<LedgerForResident> {
  const [records, entries] = await Promise.all([
    prisma.maintenanceRecord.findMany({ where: { flatId } }),
    prisma.ledgerEntry.findMany({ where: { flatId } }),
  ]);
  const totals = balancesFromRows(records, entries);

  const systemRows: LedgerRow[] = records.map((r) => {
    const [year, month] = r.period.split('-').map(Number);
    return {
      id: r.id,
      type: 'SYSTEM',
      period: r.period,
      date: new Date(year, month - 1, 1).toISOString(),
      payer: r.payerType === 'OWNER' ? 'Owner' : 'Tenant',
      amount: Number(r.amount),
      status: 'APPROVED',
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
  }));

  const merged = [...systemRows, ...ledgerRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return { entries: merged, totals };
}

export interface DepositQrResult {
  amount: number;
  upiLink: string;
  qrDataUrl: string;
}

// Same shape as the pre-pivot generatePaymentQr — stateless, no DB write — but keyed on
// a resident-chosen amount rather than specific selected record ids, re-validated
// server-side against the current payable (never trust the client's cap).
export async function generateDepositQr(flatId: string, societyId: string, amount: number): Promise<DepositQrResult> {
  const balances = await computeFlatBalances(flatId);
  if (!(amount > 0) || amount > balances.payable) throw new InvalidDepositAmountError(balances.payable);

  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const upiLink = buildUpiDeepLink({ vpa: society.upiVpa, payeeName: society.name, amount, note: 'Maintenance deposit' });
  const qrDataUrl = await generateQrDataUrl(upiLink);

  return { amount, upiLink, qrDataUrl };
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
  if (!(input.amount > 0) || input.amount > balances.payable) throw new InvalidDepositAmountError(balances.payable);

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
  file?: ProofFileInput;
}

// Covers both "advance deposit" and "expense reimbursement" (rule spec: one action for
// both). Amount/note required; screenshot optional (the mockup's "Screenshot" control
// is a decorative, unwired <div>, not a real file input) but the frontend still
// presents it prominently.
export async function createCredit(payerId: string, flatId: string, societyId: string, input: CreateCreditInput) {
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
        type: 'CREDIT',
        status: 'PENDING',
        amount: input.amount,
        note: input.note,
        fileUrl,
        mimeType,
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

// Admin review queue — optionally filtered by status/type (defaults to every entry,
// though the frontend queue only ever asks for PENDING).
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
// MaintenanceRecords anymore (payment is against the aggregate balance).
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
        action: entry.type === 'DEPOSIT' ? 'APPROVE_DEPOSIT' : 'APPROVE_CREDIT',
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
export async function manualDeposit(societyId: string, adminId: string, flatId: string, amount: number) {
  if (!(amount > 0)) throw new InvalidAmountError();

  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId } });
  if (!flat) return null;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        flatId,
        payerId: flat.currentTenantId ?? flat.ownerId,
        type: 'DEPOSIT',
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
