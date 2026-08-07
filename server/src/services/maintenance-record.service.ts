import { prisma } from '../db';
import { calculateMonthlyRate } from '../lib/rate-calculation';

// Confirmed decision (CLAUDE.md): MaintenanceRecord.dueDate = generation date + 15 days.
const DUE_DATE_DAYS = 15;

export interface GenerateResult {
  created: number;
  skipped: number;
}

// 'YYYY-MM' for "now". Exposed for callers that genuinely want the in-progress month
// (e.g. an admin previewing current-month occupancy); no longer the generation
// default — see previousPeriod() below.
export function currentPeriod(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 'YYYY-MM' for the month immediately before "now" — the default period for both the
// manual-trigger endpoint (Task 4.3) and the monthly cron (Task 4.4) under arrears
// billing. Generation deliberately targets the month that just *finished*, not the one
// in progress: calculateMonthlyRate's "majority of days in the month" rule can only be
// correct once every day of that month has actually happened and every OccupancyChange
// affecting it already exists in the DB. Generating for the current (still-unfolding)
// month would lock in a rate based on incomplete information, permanently — generation
// is idempotent and never re-runs for a period once records exist, so a mid-month
// tenant assignment or removal after that would never be reflected.
export function previousPeriod(now: Date = new Date()): string {
  const year = now.getFullYear();
  const prevMonth = now.getMonth(); // 0-indexed "this month" == 1-indexed previous month, except January
  if (prevMonth === 0) return `${year - 1}-12`;
  return `${year}-${String(prevMonth).padStart(2, '0')}`;
}

// Idempotent (Task 4.2's explicit requirement): re-running for the same society+period
// never duplicates records — @@unique([flatId, period]) plus createMany's
// skipDuplicates does the enforcement at the database level, not just in application
// logic, so a concurrent double-trigger (manual + cron racing) can't create doubles
// either.
export async function generateMaintenanceRecords(
  societyId: string,
  period: string = previousPeriod(),
): Promise<GenerateResult> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const flats = await prisma.flat.findMany({ where: { societyId } });
  if (flats.length === 0) return { created: 0, skipped: 0 };

  const [year, month] = period.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // day 0 of next month = last day of this month

  // One query for every flat's occupancy rows that could possibly overlap this month,
  // rather than N+1 queries — a real cost at 24 flats/month, not just tidiness.
  const occupancyRows = await prisma.occupancyChange.findMany({
    where: {
      flatId: { in: flats.map((f) => f.id) },
      effectiveStart: { lte: monthEnd },
      OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: monthStart } }],
    },
  });

  const occupancyByFlat = new Map<string, typeof occupancyRows>();
  for (const row of occupancyRows) {
    const list = occupancyByFlat.get(row.flatId) ?? [];
    list.push(row);
    occupancyByFlat.set(row.flatId, list);
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DUE_DATE_DAYS);

  const records = flats.map((flat) => {
    const rate = calculateMonthlyRate(
      period,
      Number(flat.baseRate),
      Number(society.tenantRateFactor),
      flat.ownerId,
      (occupancyByFlat.get(flat.id) ?? []).map((o) => ({
        tenantId: o.tenantId,
        effectiveStart: o.effectiveStart,
        effectiveEnd: o.effectiveEnd,
      })),
    );
    return {
      flatId: flat.id,
      period,
      payerType: rate.payerType,
      payerId: rate.payerId,
      amount: rate.amount,
      dueDate,
    };
  });

  const result = await prisma.maintenanceRecord.createMany({
    data: records,
    skipDuplicates: true,
  });

  return { created: result.count, skipped: records.length - result.count };
}

const FLAT_SUMMARY_INCLUDE = { flat: { select: { id: true, wing: true, flatNumber: true } } } as const;

// Task 4.5 — a resident's own SYSTEM charges (payerId = their user id), newest period
// first. Under the ledger pivot (see CLAUDE.md), every MaintenanceRecord is always an
// implicitly-"Approved" SYSTEM row — this is a building block for
// ledger.service.ts:getLedgerForResident, which merges these with the flat's
// LedgerEntry (Deposit) rows and computes the running balances; it's no longer
// exposed as its own top-level resident endpoint. Scoped by societyId via the flat
// relation too, even though payerId alone already can't cross a society boundary —
// defense-in-depth, consistent with every other query in this codebase (Task 2.6).
export async function getMaintenanceRecordsForPayer(payerId: string, societyId: string) {
  return prisma.maintenanceRecord.findMany({
    where: { payerId, flat: { societyId } },
    orderBy: { period: 'desc' },
    include: FLAT_SUMMARY_INCLUDE,
  });
}

// Task 4.6 — every SYSTEM charge in the society, admin view, optionally filtered by
// period/flat. Same flat summary shape as above, plus the payer's own summary (an
// admin needs to know *who* to follow up with, not just which flat). No status filter
// any more — every record is always "Approved" under the ledger pivot; payment
// state now lives on LedgerEntry, not here.
export async function listMaintenanceRecordsForSociety(
  societyId: string,
  filters: { period?: string; flatId?: string } = {},
) {
  return prisma.maintenanceRecord.findMany({
    where: {
      flat: { societyId },
      ...(filters.period ? { period: filters.period } : {}),
      ...(filters.flatId ? { flatId: filters.flatId } : {}),
    },
    orderBy: [{ period: 'desc' }, { flat: { wing: 'asc' } }, { flat: { flatNumber: 'asc' } }],
    include: {
      ...FLAT_SUMMARY_INCLUDE,
      payer: { select: { id: true, name: true, email: true } },
    },
  });
}
