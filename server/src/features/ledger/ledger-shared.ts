// Internals shared across ledger/admin, ledger/resident, and admin-dashboard.service.ts:
// balance/settlement formulas and InvalidAmountError.
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

// Only APPROVED entries count; MaintenanceRecord charges are always implicitly
// approved. Pure/DB-free so callers with rows already in hand (e.g. bulk per-flat
// dashboard queries) can reuse it without a redundant query. `outstanding` and
// `availableCredit` are the two sides of one subtraction — exactly one is ever
// nonzero.
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

// Per-record settlement, derived fresh on every call rather than stored. FIFO-fills
// `totalApprovedFunds` across `records` sorted oldest-to-newest by period — the
// result only depends on the current total and record set, never on the history of
// which payment covered what, so a newly-generated record automatically picks up
// any leftover funds with no extra code.
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

// Exported for reuse by admin-dashboard.service.ts, which needs the same
// per-year scoping but across a whole society's flats rather than one.
export function maintenanceRecordYearFilter(year?: number) {
  return year ? { period: { startsWith: `${year}-` } } : {};
}

export function ledgerEntryYearFilter(year?: number) {
  return year ? { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {};
}

export function otherChargeYearFilter(year?: number) {
  return year ? { dueDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {};
}

// `year` scopes both sides of the formula to a calendar year; omitted means
// all-time. `category` switches the charge-row source between MaintenanceRecord
// and OtherCharge — two independent pools, never combined into one query.
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
