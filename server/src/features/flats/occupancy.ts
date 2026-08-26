import { prisma } from '../../infrastructure/prisma/client';

// Who occupied this flat on a single date: the tenant's userId if an OccupancyChange
// row covers it, otherwise null (owner-occupied). Not the billing rate calculation,
// which operates over a whole month with a majority-wins rule.
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
