import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/prisma/client';
import { logger } from '../../infrastructure/observability';
import { calculateMonthlyRate } from '../../shared/billing/rate-calculation';
import { notify } from '../notifications/notification.service';

const DUE_DATE_DAYS = 15;

export interface GenerateResult {
  created: number;
  skipped: number;
}

// 'YYYY-MM' for the current month.
export function currentPeriod(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 'YYYY-MM' for the month before "now" — the default generation period. Billing the
// just-finished month (not the in-progress one) ensures every OccupancyChange for
// that month already exists before the majority-of-days rate rule runs; generation
// never re-runs for a period once records exist, so a mid-month occupancy change
// would otherwise never be reflected.
export function previousPeriod(now: Date = new Date()): string {
  const year = now.getFullYear();
  const prevMonth = now.getMonth(); // 0-indexed "this month" == 1-indexed previous month, except January
  if (prevMonth === 0) return `${year - 1}-12`;
  return `${year}-${String(prevMonth).padStart(2, '0')}`;
}

// Idempotent: @@unique([flatId, period]) plus createMany's skipDuplicates enforces
// no-duplicate-records at the database level, safe even under a concurrent
// manual+cron race. `actorId` is the admin who triggered generation manually, or
// undefined for the cron (system-triggered, no user in context).
export async function generateMaintenanceRecords(
  societyId: string,
  period: string = previousPeriod(),
  actorId?: string,
): Promise<GenerateResult> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const flats = await prisma.flat.findMany({ where: { societyId } });
  if (flats.length === 0) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'GENERATE_MAINTENANCE_RECORDS',
        entityType: 'MaintenanceRecord',
        entityId: period,
        note: `No flats onboarded yet for ${society.name}`,
      },
    });
    return { created: 0, skipped: 0 };
  }

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

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'GENERATE_MAINTENANCE_RECORDS',
      entityType: 'MaintenanceRecord',
      entityId: period,
      note: `${society.name}: created ${result.count}, skipped ${records.length - result.count}`,
    },
  });

  await notifyBillsGenerated(societyId, flats.map((f) => f.id), period);

  return { created: result.count, skipped: records.length - result.count };
}

// Re-reads every record for this period+flat set (createMany doesn't return created
// rows) and notifies for each; notify()'s own idempotency makes re-notifying an
// already-existing record a no-op. A notification failure never fails generation.
async function notifyBillsGenerated(
  societyId: string,
  flatIds: string[],
  period: string,
): Promise<void> {
  const periodRecords = await prisma.maintenanceRecord.findMany({
    where: { flatId: { in: flatIds }, period },
  });

  for (const record of periodRecords) {
    try {
      await notify({
        eventId: randomUUID(),
        eventType: 'MAINTENANCE_BILL_GENERATED',
        occurredAt: new Date().toISOString(),
        recipient: { userId: record.payerId },
        data: {
          billId: record.id,
          flatId: record.flatId,
          societyId,
          billingMonth: record.period,
          amount: Number(record.amount),
          dueDate: record.dueDate.toISOString(),
        },
      });
    } catch (err) {
      logger
        .child({ feature: 'maintenance' })
        .error({ err, recordId: record.id }, 'failed to enqueue MAINTENANCE_BILL_GENERATED');
    }
  }
}

const FLAT_SUMMARY_INCLUDE = {
  flat: { select: { id: true, wing: true, flatNumber: true } },
} as const;

// A resident's own SYSTEM charges (payerId = their user id), newest period first.
// Used by getLedgerForResident to merge with LedgerEntry rows into one balance.
export async function getMaintenanceRecordsForPayer(payerId: string, societyId: string) {
  return prisma.maintenanceRecord.findMany({
    where: { payerId, flat: { societyId } },
    orderBy: { period: 'desc' },
    include: FLAT_SUMMARY_INCLUDE,
  });
}

// Every SYSTEM charge in the society, admin view, optionally filtered by period/flat.
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
