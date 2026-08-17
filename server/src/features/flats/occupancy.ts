import { prisma } from '../../infrastructure/prisma/client';

/**
 * Stub payer lookup for a single date — proves the schema can answer "who was
 * occupying this flat on this date". Returns the tenant's userId if an
 * OccupancyChange row covers the date, otherwise null (owner-occupied).
 *
 * This is NOT the real billing rate calculation — majority-of-month-wins with the
 * last-day tiebreak (see CLAUDE.md) is Task 4.1's job, operating over a whole
 * calendar month rather than a single date.
 */
export async function getPayerForFlatOnDate(flatId: string, date: Date): Promise<string | null> {
  const occupancy = await prisma.occupancyChange.findFirst({
    where: {
      flatId,
      effectiveStart: { lte: date },
      OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: date } }],
    },
  });

  return occupancy?.tenantId ?? null;
}
