import { prisma } from '../../infrastructure/prisma/client';
import {
  buildEscalationMessage,
  DEFAULT_GRACE_PERIOD_DAYS,
  isOverdue,
} from '../../shared/billing/escalation';
import { balancesFromRows, computeRecordSettlements } from '../ledger/ledger-shared';
import { listFlats } from '../flats/admin/admin-flats-onboarding-service';

type FlatWithResidents = Awaited<ReturnType<typeof listFlats>>[number];

export interface DashboardSummary {
  totalBilled: number;
  totalPaid: number;
  outstandingTotal: number;
  pendingReviewTotal: number;
  collectionRatePercent: number;
}

// Society-wide bulk fetch (two queries total, not N+1 across flats), grouped by
// flatId so each flat's balances can be computed with ledger.service.ts's shared
// balancesFromRows — the exact same formula the resident's own Passbook uses, never
// duplicated here.
async function getBalancesByFlat(societyId: string) {
  const flats = await listFlats(societyId);
  const [records, entries] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where: { flat: { societyId } },
      select: { flatId: true, amount: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { flat: { societyId } },
      select: { flatId: true, type: true, status: true, amount: true },
    }),
  ]);

  const recordsByFlat = new Map<string, typeof records>();
  for (const r of records) recordsByFlat.set(r.flatId, [...(recordsByFlat.get(r.flatId) ?? []), r]);
  const entriesByFlat = new Map<string, typeof entries>();
  for (const e of entries) entriesByFlat.set(e.flatId, [...(entriesByFlat.get(e.flatId) ?? []), e]);

  return flats.map((flat) => ({
    flat,
    balances: balancesFromRows(recordsByFlat.get(flat.id) ?? [], entriesByFlat.get(flat.id) ?? []),
    pendingEntries: (entriesByFlat.get(flat.id) ?? []).filter((e) => e.status === 'PENDING'),
  }));
}

// Task 8.1 — society-wide, all-time (every MaintenanceRecord/LedgerEntry ever
// generated, not scoped to a period) since no date-range picker was asked for.
// "Outstanding" is the sum of each flat's own Outstanding — summed per flat, not
// computed as one global subtraction, since a flat that has overpaid must never
// offset another flat's balance (each Math.max(0, ...) is per-flat, per the ledger
// formula). pendingReviewTotal covers pending Deposits still awaiting review —
// neither "confirmed collected" nor "still owed with no action taken."
//
// totalPaid = approvedDeposits + approvedCredits (2026-08-08 pivot — reverses the
// prior 2026-08-07 rule that totalPaid excluded Credit as "not collected cash"; an
// approved Credit is now counted as paid/settled the same as a Deposit, same as
// availableCredit/outstanding already treat the two as fungible via approvedFunds).
// Still used for FlatDues.paidTotal below.
//
// collectionRatePercent (2026-08-09 pivot): deposits only, NOT totalPaid. At the
// society-wide headline-metric level, folding in approved Credit overstates actual
// cash collected and risks masking a collection shortfall the committee should be
// chasing — a Credit is a committee-approved adjustment, not money that came in the
// door. This only affects the rate; totalPaid itself is unchanged.
export async function getDashboardSummary(societyId: string): Promise<DashboardSummary> {
  const byFlat = await getBalancesByFlat(societyId);

  let totalBilled = 0;
  let totalPaid = 0;
  let totalApprovedDeposits = 0;
  let outstandingTotal = 0;
  let pendingReviewTotal = 0;
  for (const { balances, pendingEntries } of byFlat) {
    totalBilled += balances.totalCharges;
    totalPaid += balances.approvedDeposits + balances.approvedCredits;
    totalApprovedDeposits += balances.approvedDeposits;
    outstandingTotal += balances.outstanding;
    pendingReviewTotal += pendingEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  }
  const collectionRatePercent =
    totalBilled > 0 ? Math.round((totalApprovedDeposits / totalBilled) * 100) : 0;

  return { totalBilled, totalPaid, outstandingTotal, pendingReviewTotal, collectionRatePercent };
}

export interface FlatDues {
  flat: { id: string; wing: string; flatNumber: string };
  owner: FlatWithResidents['owner'];
  currentTenant: FlatWithResidents['currentTenant'];
  paidTotal: number;
  outstandingTotal: number;
  creditTotal: number;
}

// Task 8.2 — every flat, not just the ones with dues (a settled flat showing ₹0 is
// itself useful information for an admin scanning the table), sorted highest-owed
// first. outstandingTotal here is each flat's Outstanding — the primary "what they
// owe right now" figure. paidTotal is that flat's approvedDeposits + approvedCredits
// (2026-08-08 pivot, same as getDashboardSummary's totalPaid — see that function's
// comment), reused here per-flat rather than only in the aggregate. creditTotal is
// that flat's availableCredit — the flip side of outstanding (exactly one of the two
// is ever nonzero, per ledger.service.ts's balancesFromRows) — a distinct figure from
// paidTotal: paidTotal is the cumulative funds ever applied, creditTotal is whatever
// of that is still unused after covering totalCharges.
export async function getFlatWiseDues(societyId: string): Promise<FlatDues[]> {
  const byFlat = await getBalancesByFlat(societyId);

  return byFlat
    .map(({ flat, balances }) => ({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      owner: flat.owner,
      currentTenant: flat.currentTenant,
      paidTotal: balances.approvedDeposits + balances.approvedCredits,
      outstandingTotal: balances.outstanding,
      creditTotal: balances.availableCredit,
    }))
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

// Task 8.4 — rule 8's escalation. A Deposit is not tied to specific charges (payment
// is against the aggregate balance), but a MaintenanceRecord's own settlement state
// *is* derivable (computeRecordSettlements, ledger.service.ts's FIFO fill against the
// flat's approved-deposit total) — so "oldest charge" means the oldest record that
// isn't fully PAID yet, not just the oldest record overall. A flat that has already
// settled its oldest few months but still owes newer ones must be judged against the
// newer, still-open month's due date, not a stale already-paid one. A flat is flagged
// when it still has something Outstanding AND that oldest-unsettled charge's dueDate
// is past dueDate + gracePeriodDays (default 7, CLAUDE.md's confirmed decision;
// query-param overridable). outstandingTotal is the flat's full Outstanding (rule 8's
// "computes outstanding total... across all that flat's unpaid records"), not just
// whatever portion happens to be technically overdue.
export async function getFlaggedFlats(
  societyId: string,
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS,
): Promise<FlaggedFlat[]> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const byFlat = await getBalancesByFlat(societyId);
  const records = await prisma.maintenanceRecord.findMany({
    where: { flat: { societyId } },
    select: { id: true, flatId: true, period: true, amount: true, dueDate: true },
  });

  const now = new Date();
  const recordsByFlat = new Map<string, typeof records>();
  for (const r of records) recordsByFlat.set(r.flatId, [...(recordsByFlat.get(r.flatId) ?? []), r]);

  const flagged: FlaggedFlat[] = [];
  for (const { flat, balances } of byFlat) {
    if (balances.outstanding <= 0) continue;
    const flatRecords = recordsByFlat.get(flat.id) ?? [];
    if (flatRecords.length === 0) continue;

    const settlements = computeRecordSettlements(
      flatRecords,
      balances.approvedDeposits + balances.approvedCredits,
    );
    const unsettled = flatRecords
      .filter((r) => settlements.get(r.id)?.status !== 'PAID')
      .sort((a, b) => a.period.localeCompare(b.period));
    // balances.outstanding > 0 guarantees at least one non-PAID record exists — the
    // FIFO fill can never mark every record PAID while approvedDeposits < totalCharges.
    const oldestUnsettled = unsettled[0]!;
    const oldestDueDate = oldestUnsettled.dueDate;
    if (!isOverdue(oldestDueDate, gracePeriodDays, now)) continue;
    // How many still-open (not fully settled) months have passed their due date — a
    // month that's already PAID off, even if its due date is technically in the past,
    // isn't part of "how overdue is this flat" from the admin's perspective.
    const overdueRecordCount = unsettled.filter((r) =>
      isOverdue(r.dueDate, gracePeriodDays, now),
    ).length;

    // Whoever currently occupies the flat, not whichever payerId happens to be on the
    // oldest charge — a mid-history tenant swap could otherwise name someone who has
    // already moved out as the message's recipient.
    const recipient = flat.currentTenant ?? flat.owner;

    flagged.push({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      recipient,
      outstandingTotal: balances.outstanding,
      oldestDueDate,
      overdueRecordCount,
      message: buildEscalationMessage({
        recipientName: recipient.name,
        wing: flat.wing,
        flatNumber: flat.flatNumber,
        outstandingTotal: balances.outstanding,
        oldestDueDate,
        societyName: society.name,
      }),
    });
  }

  return flagged.sort((a, b) => a.oldestDueDate.getTime() - b.oldestDueDate.getTime());
}
