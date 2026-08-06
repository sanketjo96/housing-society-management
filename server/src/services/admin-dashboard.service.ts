import { prisma } from '../db';
import { buildEscalationMessage, DEFAULT_GRACE_PERIOD_DAYS, isOverdue } from '../lib/escalation';
import { listFlats } from './flats.service';

type FlatWithResidents = Awaited<ReturnType<typeof listFlats>>[number];

export interface DashboardSummary {
  totalBilled: number;
  totalPaid: number;
  outstandingTotal: number;
  pendingReviewTotal: number;
  collectionRatePercent: number;
}

// Task 8.1 — society-wide, all-time (every MaintenanceRecord ever generated, not
// scoped to a period) since no date-range picker was asked for. "Outstanding" here
// means strictly UNPAID; PENDING_REVIEW (proof submitted, awaiting admin action) is
// broken out separately rather than folded into either bucket, since it's neither
// "still owed with no action taken" nor "confirmed collected."
export async function getDashboardSummary(societyId: string): Promise<DashboardSummary> {
  const records = await prisma.maintenanceRecord.findMany({
    where: { flat: { societyId } },
    select: { amount: true, status: true },
  });

  let totalPaid = 0;
  let outstandingTotal = 0;
  let pendingReviewTotal = 0;
  for (const r of records) {
    const amount = Number(r.amount);
    if (r.status === 'PAID') totalPaid += amount;
    else if (r.status === 'UNPAID') outstandingTotal += amount;
    else pendingReviewTotal += amount;
  }
  const totalBilled = totalPaid + outstandingTotal + pendingReviewTotal;
  const collectionRatePercent = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  return { totalBilled, totalPaid, outstandingTotal, pendingReviewTotal, collectionRatePercent };
}

export interface FlatDues {
  flat: { id: string; wing: string; flatNumber: string };
  owner: FlatWithResidents['owner'];
  currentTenant: FlatWithResidents['currentTenant'];
  outstandingTotal: number;
  unpaidCount: number;
}

// Task 8.2 — every flat, not just the ones with dues (a settled flat showing ₹0 is
// itself useful information for an admin scanning the table), sorted highest-owed
// first. UNPAID and PENDING_REVIEW both count toward "outstanding" here (unlike the
// summary widget, which breaks them out) — from a "who do I need to follow up with"
// perspective, a flat mid-review is still not yet a closed matter.
export async function getFlatWiseDues(societyId: string): Promise<FlatDues[]> {
  const flats = await listFlats(societyId);
  const records = await prisma.maintenanceRecord.findMany({
    where: { flat: { societyId }, status: { in: ['UNPAID', 'PENDING_REVIEW'] } },
    select: { flatId: true, amount: true },
  });

  const duesByFlat = new Map<string, { total: number; count: number }>();
  for (const r of records) {
    const existing = duesByFlat.get(r.flatId) ?? { total: 0, count: 0 };
    existing.total += Number(r.amount);
    existing.count += 1;
    duesByFlat.set(r.flatId, existing);
  }

  return flats
    .map((flat) => {
      const dues = duesByFlat.get(flat.id) ?? { total: 0, count: 0 };
      return {
        flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
        owner: flat.owner,
        currentTenant: flat.currentTenant,
        outstandingTotal: dues.total,
        unpaidCount: dues.count,
      };
    })
    .sort((a, b) => b.outstandingTotal - a.outstandingTotal);
}

export interface FlaggedFlat {
  flat: { id: string; wing: string; flatNumber: string };
  recipient: { id: string; name: string; email: string };
  outstandingTotal: number;
  oldestDueDate: Date;
  overdueRecordCount: number;
  message: string;
}

// Task 8.4 — rule 8's escalation: a flat is flagged once at least one UNPAID record is
// past dueDate + gracePeriodDays (default 7, CLAUDE.md's confirmed decision;
// query-param overridable — see the "configurable" language in that same decision —
// rather than a persisted Society setting, since nothing asked for a settings-tab
// field and a query param already satisfies "configurable"). The computed
// outstandingTotal is across *all* of that flat's unpaid records (rule 8's exact
// wording), not just the overdue one(s) — a flat with one overdue ₹1500 record and one
// not-yet-overdue ₹1500 record gets flagged for the full ₹3000, so the admin sees the
// complete picture, not just the technically-breached portion.
export async function getFlaggedFlats(
  societyId: string,
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS,
): Promise<FlaggedFlat[]> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const flats = await listFlats(societyId);
  const unpaidRecords = await prisma.maintenanceRecord.findMany({
    where: { flat: { societyId }, status: 'UNPAID' },
    select: { flatId: true, amount: true, dueDate: true },
  });

  const now = new Date();
  const byFlat = new Map<string, { total: number; oldestDueDate: Date; overdueCount: number; hasOverdue: boolean }>();
  for (const r of unpaidRecords) {
    const existing = byFlat.get(r.flatId) ?? {
      total: 0,
      oldestDueDate: r.dueDate,
      overdueCount: 0,
      hasOverdue: false,
    };
    existing.total += Number(r.amount);
    if (r.dueDate < existing.oldestDueDate) existing.oldestDueDate = r.dueDate;
    if (isOverdue(r.dueDate, gracePeriodDays, now)) {
      existing.overdueCount += 1;
      existing.hasOverdue = true;
    }
    byFlat.set(r.flatId, existing);
  }

  const flagged: FlaggedFlat[] = [];
  for (const flat of flats) {
    const dues = byFlat.get(flat.id);
    if (!dues || !dues.hasOverdue) continue;

    // Whoever currently occupies the flat, not whichever payerId happens to be on
    // the overdue record(s) — a mid-history tenant swap could otherwise name someone
    // who has already moved out as the message's recipient.
    const recipient = flat.currentTenant ?? flat.owner;

    flagged.push({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      recipient,
      outstandingTotal: dues.total,
      oldestDueDate: dues.oldestDueDate,
      overdueRecordCount: dues.overdueCount,
      message: buildEscalationMessage({
        recipientName: recipient.name,
        wing: flat.wing,
        flatNumber: flat.flatNumber,
        outstandingTotal: dues.total,
        oldestDueDate: dues.oldestDueDate,
        societyName: society.name,
      }),
    });
  }

  return flagged.sort((a, b) => a.oldestDueDate.getTime() - b.oldestDueDate.getTime());
}
