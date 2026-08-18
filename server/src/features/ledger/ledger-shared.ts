// Internals shared across ledger/admin and ledger/resident — the balance/settlement
// formulas, and InvalidAmountError (thrown by both admin's manualDeposit and
// resident's createCredit). Also consumed cross-feature by
// admin-dashboard.service.ts, which needs the exact same balance formula the
// resident's own Passbook uses, never duplicated.
import { prisma } from '../../infrastructure/prisma/client';
import type { LedgerType, ProofStatus } from '../../infrastructure/prisma/generated/client';

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
