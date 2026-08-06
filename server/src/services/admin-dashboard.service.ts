import { prisma } from '../db';
import { buildEscalationMessage, DEFAULT_GRACE_PERIOD_DAYS, isOverdue } from '../lib/escalation';
import { balancesFromRows } from './ledger.service';
import { listFlats } from './flats.service';

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
    prisma.maintenanceRecord.findMany({ where: { flat: { societyId } }, select: { flatId: true, amount: true } }),
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
// "Outstanding" is the sum of each flat's own Payable (net of that flat's approved
// credit) — summed per flat, not computed as one global subtraction, since a flat that
// has overpaid must never offset another flat's balance (each Math.max(0, ...) is
// per-flat, per the ledger pivot's formula). pendingReviewTotal covers both pending
// Deposits and pending Credits together — neither "confirmed collected" nor "still
// owed with no action taken."
export async function getDashboardSummary(societyId: string): Promise<DashboardSummary> {
  const byFlat = await getBalancesByFlat(societyId);

  let totalBilled = 0;
  let totalPaid = 0;
  let outstandingTotal = 0;
  let pendingReviewTotal = 0;
  for (const { balances, pendingEntries } of byFlat) {
    totalBilled += balances.totalCharges;
    totalPaid += balances.approvedDeposits;
    outstandingTotal += balances.payable;
    pendingReviewTotal += pendingEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  }
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
// first. outstandingTotal here is each flat's Payable (net of approved credit) — the
// primary "what they owe right now" figure under the ledger model.
// unpaidCount is the number of pending Deposit/Credit rows still awaiting review for
// that flat (a rough "how much activity is in flight" signal, distinct from Payable).
export async function getFlatWiseDues(societyId: string): Promise<FlatDues[]> {
  const byFlat = await getBalancesByFlat(societyId);

  return byFlat
    .map(({ flat, balances, pendingEntries }) => ({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      owner: flat.owner,
      currentTenant: flat.currentTenant,
      outstandingTotal: balances.payable,
      unpaidCount: pendingEntries.length,
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

// Task 8.4 — rule 8's escalation. Under the ledger pivot, a Deposit is no longer tied
// to specific charges (payment is against the aggregate balance), so there's no
// per-charge paid/unpaid state to check directly any more. A flat is flagged when it
// still has something Payable AND its OLDEST SYSTEM charge's dueDate is past
// dueDate + gracePeriodDays (default 7, CLAUDE.md's confirmed decision; query-param
// overridable) — the natural generalization of "you still owe money and your oldest
// bill has been sitting a while." outstandingTotal is the flat's full Payable (rule
// 8's "computes outstanding total... across all that flat's unpaid records"), not
// just whatever portion happens to be technically overdue.
export async function getFlaggedFlats(
  societyId: string,
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS,
): Promise<FlaggedFlat[]> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const byFlat = await getBalancesByFlat(societyId);
  const records = await prisma.maintenanceRecord.findMany({
    where: { flat: { societyId } },
    select: { flatId: true, dueDate: true },
  });

  const now = new Date();
  const dueDatesByFlat = new Map<string, Date[]>();
  for (const r of records) dueDatesByFlat.set(r.flatId, [...(dueDatesByFlat.get(r.flatId) ?? []), r.dueDate]);

  const flagged: FlaggedFlat[] = [];
  for (const { flat, balances } of byFlat) {
    if (balances.payable <= 0) continue;
    const dueDates = dueDatesByFlat.get(flat.id) ?? [];
    if (dueDates.length === 0) continue;
    const oldestDueDate = dueDates.reduce((oldest, d) => (d < oldest ? d : oldest));
    if (!isOverdue(oldestDueDate, gracePeriodDays, now)) continue;
    // How many months' SYSTEM charges have passed their due date, by calendar time —
    // there's no per-charge paid/unpaid state to count any more under the ledger
    // model (payment is against the aggregate, not specific months), but this is
    // still a meaningful "how overdue is this flat" signal for the admin.
    const overdueRecordCount = dueDates.filter((d) => isOverdue(d, gracePeriodDays, now)).length;

    // Whoever currently occupies the flat, not whichever payerId happens to be on the
    // oldest charge — a mid-history tenant swap could otherwise name someone who has
    // already moved out as the message's recipient.
    const recipient = flat.currentTenant ?? flat.owner;

    flagged.push({
      flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
      recipient,
      outstandingTotal: balances.payable,
      oldestDueDate,
      overdueRecordCount,
      message: buildEscalationMessage({
        recipientName: recipient.name,
        wing: flat.wing,
        flatNumber: flat.flatNumber,
        outstandingTotal: balances.payable,
        oldestDueDate,
        societyName: society.name,
      }),
    });
  }

  return flagged.sort((a, b) => a.oldestDueDate.getTime() - b.oldestDueDate.getTime());
}
