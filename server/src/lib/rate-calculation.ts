// Task 4.1 — the pure rate calculator. Deliberately no Prisma/DB types: takes
// already-fetched OccupancyChange rows as plain data, so it's testable in isolation
// (tests/lib/rate-calculation.test.ts) and reusable from both the manual-trigger
// endpoint and the monthly cron job (Task 4.2), per CLAUDE.md's "Backend architecture"
// note on why this split exists.

export interface OccupancyPeriod {
  tenantId: string;
  effectiveStart: Date;
  effectiveEnd: Date | null;
}

export interface MonthlyRateResult {
  payerType: 'OWNER' | 'TENANT';
  payerId: string;
  amount: number;
}

const OWNER = Symbol('owner');

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Confirmed decision (CLAUDE.md, Task 4.1): for a flat's month, sum days under each
// occupancy status. Whichever status has more days sets the rate for the *entire*
// month's single MaintenanceRecord. On an exact tie, the status active on the last
// day of the month wins. Generalized here from "owner vs tenant" to "whichever
// specific party (the owner, or any one tenant) occupied the most days" — handles a
// tenant-to-tenant turnover mid-month the same way, rather than needing a special case.
export function calculateMonthlyRate(
  period: string,
  baseRate: number,
  tenantRateFactor: number,
  ownerId: string,
  occupancyChanges: OccupancyPeriod[],
): MonthlyRateResult {
  const [year, month] = period.split('-').map(Number);
  const totalDays = daysInMonth(year, month);

  const dayCounts = new Map<string | typeof OWNER, number>();
  let lastDayParty: string | typeof OWNER = OWNER;

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month - 1, day);
    const covering = occupancyChanges.find(
      (o) => o.effectiveStart <= date && (o.effectiveEnd === null || o.effectiveEnd >= date),
    );
    const party: string | typeof OWNER = covering ? covering.tenantId : OWNER;
    dayCounts.set(party, (dayCounts.get(party) ?? 0) + 1);
    if (day === totalDays) lastDayParty = party;
  }

  let winner: string | typeof OWNER = OWNER;
  let winnerDays = -1;
  for (const [party, days] of dayCounts) {
    if (days > winnerDays || (days === winnerDays && party === lastDayParty)) {
      winner = party;
      winnerDays = days;
    }
  }

  if (winner === OWNER) {
    return { payerType: 'OWNER', payerId: ownerId, amount: baseRate };
  }

  const amount = Math.round(baseRate * tenantRateFactor * 100) / 100;
  return { payerType: 'TENANT', payerId: winner, amount };
}
