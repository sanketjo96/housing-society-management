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
  // docs/features/other-charges/ — a fully separate pool from the maintenance figures above.
  otherChargesOutstandingTotal: number;
  totalOutstandingTotal: number;
  // The society's own income/expenditure, unrelated to resident billing.
  // "Recorded since tracking began" — not a live bank balance.
  societyTotalIncome: number;
  societyTotalExpense: number;
  societyNetPosition: number;
}

// Fetches all flats' records/entries in two queries (not N+1), then groups by
// flatId and runs each through balancesFromRows. `category` selects which pool:
// MAINTENANCE reads MaintenanceRecord, OTHER_CHARGE reads OtherCharge.
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

// Society-wide, all-time totals. outstandingTotal sums each flat's own
// Outstanding rather than one global subtraction, so an overpaid flat never
// offsets another flat's balance.
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

  // Separate pool, summed per-flat like outstandingTotal above.
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

// Every flat (not just ones with dues), sorted highest-owed first. Maintenance
// pool only — Other Charges has its own per-charge drill-down instead.
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

// Every flat, both pools (Maintenance + Other Charges) combined into one row,
// sorted by wing then flat number.
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

// Flags a flat when it has Outstanding > 0 and its oldest not-yet-PAID
// MaintenanceRecord is past dueDate + gracePeriodDays (default 7).
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
    // outstanding > 0 guarantees at least one non-PAID record exists.
    const oldestUnsettled = unsettled[0]!;
    const oldestDueDate = oldestUnsettled.dueDate;
    if (!isOverdue(oldestDueDate, gracePeriodDays, now)) continue;
    // Only counts records not already settled off.
    const overdueRecordCount = unsettled.filter((r) =>
      isOverdue(r.dueDate, gracePeriodDays, now),
    ).length;

    // Current occupant, not the payer on the oldest charge (may have moved out).
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
