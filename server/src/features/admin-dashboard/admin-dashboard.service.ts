import { prisma } from '../../infrastructure/prisma/client';
import type { LedgerCategory } from '../../infrastructure/prisma/generated/client';
import {
  buildEscalationMessage,
  DEFAULT_GRACE_PERIOD_DAYS,
  isOverdue,
} from '../../shared/billing/escalation';
import { balancesFromRows, computeRecordSettlements } from '../ledger/ledger-shared';
import { listFlats } from '../flats/admin/admin-flats-onboarding-service';
import { getSocietyLedgerTotals } from '../society-ledger/society-ledger.service';

type FlatWithResidents = Awaited<ReturnType<typeof listFlats>>[number];

export interface DashboardSummary {
  totalBilled: number;
  totalPaid: number;
  outstandingTotal: number;
  pendingReviewTotal: number;
  collectionRatePercent: number;
  // docs/other-charges/ — a fully separate pool from the maintenance figures above.
  otherChargesOutstandingTotal: number;
  totalOutstandingTotal: number;
  // docs/manage-finance/ — the society's own income/expenditure (SocietyLedgerEntry),
  // entirely unrelated to the resident-billing figures above (no shared rows, no
  // shared math). "Recorded since tracking began" — NOT a live bank balance; there
  // is no admin-configurable opening balance to anchor it to one (future scope).
  societyTotalIncome: number;
  societyTotalExpense: number;
  societyNetPosition: number;
}

// Society-wide bulk fetch (two queries total, not N+1 across flats), grouped by
// flatId so each flat's balances can be computed with ledger.service.ts's shared
// balancesFromRows — the exact same formula the resident's own Passbook uses, never
// duplicated here.
//
// `category` (docs/other-charges/) — default MAINTENANCE, backward compatible with
// every existing call site. When OTHER_CHARGE, queries OtherCharge instead of
// MaintenanceRecord and filters LedgerEntry to matching-category rows — the same
// parameterization pattern as ledger-shared.ts's computeFlatBalances, one function
// reused twice rather than a duplicated sibling.
async function getBalancesByFlat(societyId: string, category: LedgerCategory = 'MAINTENANCE') {
  const flats = await listFlats(societyId);
  const [records, entries] = await Promise.all([
    category === 'MAINTENANCE'
      ? prisma.maintenanceRecord.findMany({
          where: { flat: { societyId } },
          select: { flatId: true, amount: true },
        })
      : prisma.otherCharge.findMany({
          where: { flat: { societyId } },
          select: { flatId: true, amount: true },
        }),
    prisma.ledgerEntry.findMany({
      where: { flat: { societyId }, category },
      select: { flatId: true, status: true, amount: true },
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
// totalPaid = approvedDeposits — Credit was removed for good on 2026-08-20 (see
// CLAUDE.md's pivot addendum); every LedgerEntry is a Deposit now, so this and
// collectionRatePercent read the same figure. Still used for FlatDues.paidTotal
// below.
export async function getDashboardSummary(societyId: string): Promise<DashboardSummary> {
  const [byFlat, byFlatOtherCharges, societyLedgerTotals] = await Promise.all([
    getBalancesByFlat(societyId),
    getBalancesByFlat(societyId, 'OTHER_CHARGE'),
    getSocietyLedgerTotals(societyId),
  ]);

  let totalBilled = 0;
  let totalPaid = 0;
  let outstandingTotal = 0;
  let pendingReviewTotal = 0;
  for (const { balances, pendingEntries } of byFlat) {
    totalBilled += balances.totalCharges;
    totalPaid += balances.approvedDeposits;
    outstandingTotal += balances.outstanding;
    pendingReviewTotal += pendingEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  }
  const collectionRatePercent = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  // Fully separate pool (docs/other-charges/) — summed per-flat, same Math.max(0,...)-
  // per-flat convention as outstandingTotal above, never netted against a flat that's
  // overpaid on the other pool. totalOutstandingTotal is a plain sum of two already-
  // floored figures.
  const otherChargesOutstandingTotal = byFlatOtherCharges.reduce(
    (sum, { balances }) => sum + balances.outstanding,
    0,
  );

  return {
    totalBilled,
    totalPaid,
    outstandingTotal,
    pendingReviewTotal,
    collectionRatePercent,
    otherChargesOutstandingTotal,
    totalOutstandingTotal: outstandingTotal + otherChargesOutstandingTotal,
    societyTotalIncome: societyLedgerTotals.totalIncome,
    societyTotalExpense: societyLedgerTotals.totalExpense,
    societyNetPosition: societyLedgerTotals.net,
  };
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
// owe right now" figure. paidTotal is that flat's approvedDeposits (same as
// getDashboardSummary's totalPaid — see that function's comment), reused here
// per-flat rather than only in the aggregate. creditTotal is that flat's
// availableCredit — the flip side of outstanding (exactly one of the two is ever
// nonzero, per ledger-shared.ts's balancesFromRows) — a distinct figure from
// paidTotal: paidTotal is the cumulative funds ever applied, creditTotal is whatever
// of that is still unused after covering totalCharges.
//
// Maintenance only — the admin Dashboard's "Other Charges Outstanding Total" tile
// drills into a per-charge list instead (GET /api/admin/other-charges, already
// carries settlement status and fee type; docs/other-charges/), not a flat-wise
// aggregate, since a fee-type breakdown only makes sense per charge.
export async function getFlatWiseDues(societyId: string): Promise<FlatDues[]> {
  const byFlat = await getBalancesByFlat(societyId);

  return byFlat
    .map(({ flat, balances }) => ({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      owner: flat.owner,
      currentTenant: flat.currentTenant,
      paidTotal: balances.approvedDeposits,
      outstandingTotal: balances.outstanding,
      creditTotal: balances.availableCredit,
    }))
    .sort((a, b) => b.outstandingTotal - a.outstandingTotal);
}

export interface ResidentLedgerRow {
  flat: { id: string; wing: string; flatNumber: string };
  owner: FlatWithResidents['owner'];
  currentTenant: FlatWithResidents['currentTenant'];
  outstandingMaintenance: number;
  paidMaintenance: number;
  creditMaintenance: number;
  outstandingOtherCharges: number;
}

// "Manage Resident Ledger" — a comprehensive per-flat overview combining both pools
// (Maintenance + Other Charges, docs/other-charges/) in one row, reached via its own
// sidebar nav item rather than a dashboard drill-down like /flat-dues or
// /other-charges-dues (both of which are filtered to only what's currently owed).
// Lists every flat, not just ones with a balance — a "manage" page is meant for
// browsing the whole society, not flagging exceptions — sorted by wing then flat
// number (a stable directory order) rather than by any balance figure. Two
// independent getBalancesByFlat calls, same pattern as getDashboardSummary above —
// never a single merged query, since the two pools' charge sources
// (MaintenanceRecord vs OtherCharge) are genuinely different tables.
export async function getResidentLedgerOverview(societyId: string): Promise<ResidentLedgerRow[]> {
  const [byFlat, byFlatOtherCharges] = await Promise.all([
    getBalancesByFlat(societyId),
    getBalancesByFlat(societyId, 'OTHER_CHARGE'),
  ]);
  const otherChargesOutstandingByFlatId = new Map(
    byFlatOtherCharges.map(({ flat, balances }) => [flat.id, balances.outstanding]),
  );

  return byFlat
    .map(({ flat, balances }) => ({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      owner: flat.owner,
      currentTenant: flat.currentTenant,
      outstandingMaintenance: balances.outstanding,
      paidMaintenance: balances.approvedDeposits,
      creditMaintenance: balances.availableCredit,
      outstandingOtherCharges: otherChargesOutstandingByFlatId.get(flat.id) ?? 0,
    }))
    .sort((a, b) => `${a.flat.wing}${a.flat.flatNumber}`.localeCompare(`${b.flat.wing}${b.flat.flatNumber}`));
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

    const settlements = computeRecordSettlements(flatRecords, balances.approvedDeposits);
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
