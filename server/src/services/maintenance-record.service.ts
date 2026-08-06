import { prisma } from '../db';
import { calculateMonthlyRate } from '../lib/rate-calculation';

// Confirmed decision (CLAUDE.md): MaintenanceRecord.dueDate = generation date + 15 days.
const DUE_DATE_DAYS = 15;

export interface GenerateResult {
  created: number;
  skipped: number;
}

// 'YYYY-MM' for "now" — the default period both the manual-trigger endpoint (Task 4.3)
// and the monthly cron (Task 4.4) generate for when no explicit period is given.
export function currentPeriod(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Idempotent (Task 4.2's explicit requirement): re-running for the same society+period
// never duplicates records — @@unique([flatId, period]) plus createMany's
// skipDuplicates does the enforcement at the database level, not just in application
// logic, so a concurrent double-trigger (manual + cron racing) can't create doubles
// either.
export async function generateMaintenanceRecords(
  societyId: string,
  period: string = currentPeriod(),
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

// Task 4.5 — a resident's own records (payerId = their user id), newest period first.
// This is "the resident's primary outstanding-balance view" (see CLAUDE.md's pivot
// note): the frontend filters status === 'UNPAID' and sums amount client-side rather
// than this endpoint pre-computing a total, since the full record list is needed
// anyway (Task 6.x's "select any combination of unpaid records to pay"). Scoped by
// societyId via the flat relation too, even though payerId alone already can't cross
// a society boundary — defense-in-depth, consistent with every other query in this
// codebase (Task 2.6).
export async function getMaintenanceRecordsForPayer(payerId: string, societyId: string) {
  return prisma.maintenanceRecord.findMany({
    where: { payerId, flat: { societyId } },
    orderBy: { period: 'desc' },
    include: FLAT_SUMMARY_INCLUDE,
  });
}

// Task 4.6 — every record in the society, admin view, optionally filtered. Same flat
// summary shape as above, plus the payer's own summary (an admin needs to know *who*
// to follow up with, not just which flat).
export async function listMaintenanceRecordsForSociety(
  societyId: string,
  filters: { status?: 'UNPAID' | 'PENDING_REVIEW' | 'PAID'; period?: string; flatId?: string } = {},
) {
  return prisma.maintenanceRecord.findMany({
    where: {
      flat: { societyId },
      ...(filters.status ? { status: filters.status } : {}),
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
