import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { SEED_SOCIETY_NAME, main as runSeed } from '../prisma/seed';

describe('seed script', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates the expected society, users, flats, and occupancy history', async () => {
    await runSeed();

    const society = await prisma.society.findFirstOrThrow({
      where: { name: SEED_SOCIETY_NAME },
    });

    const userCount = await prisma.user.count({ where: { societyId: society.id } });
    expect(userCount).toBe(10); // 1 admin + 5 owners + 4 tenants

    const flats = await prisma.flat.findMany({
      where: { societyId: society.id },
      include: { occupancyChanges: true },
    });
    expect(flats).toHaveLength(5);

    const occupiedFlats = flats.filter((f) => f.currentTenantId !== null);
    expect(occupiedFlats).toHaveLength(2); // A-103 and B-201

    const totalOccupancyChanges = flats.reduce((sum, f) => sum + f.occupancyChanges.length, 0);
    expect(totalOccupancyChanges).toBe(4);

    const midHistoryFlat = flats.find((f) => f.occupancyChanges.length > 1);
    expect(midHistoryFlat).toBeDefined();
    expect(midHistoryFlat?.occupancyChanges.some((oc) => oc.effectiveEnd !== null)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate data', async () => {
    await runSeed();
    await runSeed();

    const society = await prisma.society.findFirstOrThrow({
      where: { name: SEED_SOCIETY_NAME },
    });
    const userCount = await prisma.user.count({ where: { societyId: society.id } });
    const flatCount = await prisma.flat.count({ where: { societyId: society.id } });

    expect(userCount).toBe(10);
    expect(flatCount).toBe(5);
  });
});
