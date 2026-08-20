// Internals shared across ledger/admin and ledger/resident — the balance/settlement
// formulas, and InvalidAmountError (thrown by resident createDeposit/createOrReplace-
// PaymentIntent and admin manualDeposit alike). Also consumed cross-feature by
// admin-dashboard.service.ts, which needs the exact same balance formula the
// resident's own Passbook uses, never duplicated.
import { prisma } from '../../infrastructure/prisma/client';
import type { LedgerCategory, ProofStatus } from '../../infrastructure/prisma/generated/client';

export class InvalidAmountError extends Error {
  constructor() {
    super('Amount must be greater than 0');
    this.name = 'InvalidAmountError';
  }
}

export interface FlatBalances {
  totalCharges: number;
  approvedDeposits: number;
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
// Credit removed for good (2026-08-20) — see CLAUDE.md's pivot addendum. A
// LedgerEntry only ever represents a Deposit now, and Deposit's amount cap against
// Outstanding was lifted the same day: a resident can pay more than they currently
// owe, and the excess is exactly `availableCredit` below — the *other side* of the
// same subtraction as `outstanding`. Exactly one of the two is ever nonzero at a time.
export function balancesFromRows(
  records: { amount: unknown }[],
  entries: { status: ProofStatus; amount: unknown }[],
): FlatBalances {
  const totalCharges = records.reduce((sum, r) => sum + Number(r.amount), 0);
  const approvedDeposits = entries
    .filter((e) => e.status === 'APPROVED')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const outstanding = Math.max(0, totalCharges - approvedDeposits);
  const availableCredit = Math.max(0, approvedDeposits - totalCharges);

  return { totalCharges, approvedDeposits, outstanding, availableCredit };
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
// `totalApprovedFunds` is `approvedDeposits` (FlatBalances) — this function itself
// never needed to know Deposit vs Credit even when Credit existed: money is money
// once it's summed. This is also exactly what makes "available credit auto-consumed
// by a newly-generated record" work with no extra code: rerunning this same fill
// against a larger record set naturally lands leftover funds on the new record.
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

function otherChargeYearFilter(year?: number) {
  return year ? { dueDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {};
}

// `year` scopes both sides of the formula to a calendar year (MaintenanceRecord by
// its `period`'s year, LedgerEntry by `createdAt`'s year) — used wherever a
// resident is acting against the balance shown for a specific year on their
// Dashboard (creating a payment intent, etc). Omitted = the original all-time
// behavior, still used by admin-dashboard.service.ts's bulk per-flat calc.
//
// `category` (docs/other-charges/) — default MAINTENANCE, fully backward compatible
// with every existing call site. When OTHER_CHARGE, the charge-row source switches
// from MaintenanceRecord to OtherCharge and the LedgerEntry query is filtered to
// matching-category rows — two fully independent pools, never combined into one
// query or one formula call. balancesFromRows itself needs no changes either way;
// it was already generic over `{ amount }[]` before this feature existed.
export async function computeFlatBalances(
  flatId: string,
  year?: number,
  category: LedgerCategory = 'MAINTENANCE',
): Promise<FlatBalances> {
  const [records, entries] = await Promise.all([
    category === 'MAINTENANCE'
      ? prisma.maintenanceRecord.findMany({
          where: { flatId, ...maintenanceRecordYearFilter(year) },
          select: { amount: true },
        })
      : prisma.otherCharge.findMany({
          where: { flatId, ...otherChargeYearFilter(year) },
          select: { amount: true },
        }),
    prisma.ledgerEntry.findMany({
      where: { flatId, category, ...ledgerEntryYearFilter(year) },
      select: { status: true, amount: true },
    }),
  ]);
  return balancesFromRows(records, entries);
}
