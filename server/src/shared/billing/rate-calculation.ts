// Pure rate calculator — takes already-fetched OccupancyChange rows as plain
// data, no Prisma types, callable from both the manual-trigger endpoint and the
// monthly cron job.

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

// Sums days under each occupancy status for the month; whichever party (owner or
// a specific tenant) has the most days sets the rate for the whole month. Ties
// go to whoever occupied on the last day of the month.
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
