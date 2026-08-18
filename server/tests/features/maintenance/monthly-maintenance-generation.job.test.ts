import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { runMonthlyMaintenanceGeneration } from '../../../src/jobs/monthly-maintenance-generation.job';

// A distinctive, never-real period ('2099-01') so this test's records can be
// unambiguously identified and cleaned up globally afterward — the job iterates every
// society in the database, including the persistent seed data (Sunrise Residency),
// not just the throwaway test society this file creates.
const TEST_PERIOD = '2099-01';

describe('runMonthlyMaintenanceGeneration', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyAId: string;
  let societyBId: string;
  let flatAId: string;
  let flatBId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const societyA = await prisma.society.create({
      data: { name: `Job Society A ${suffix}`, address: '1 Test St', upiVpa: 'a@okhdfcbank' },
    });
    societyAId = societyA.id;

    const societyB = await prisma.society.create({
      data: { name: `Job Society B ${suffix}`, address: '2 Test St', upiVpa: 'b@okhdfcbank' },
    });
    societyBId = societyB.id;

    const flatA = await createFlat({
      societyId: societyAId,
      wing: 'J',
      flatNumber: '101',
      baseRate: 1500,
      ownerName: 'Job Owner A',
      ownerEmail: `job-owner-a-${suffix}@example.com`,
    });
    flatAId = flatA!.id;
    createdFlatIds.push(flatAId);

    const flatB = await createFlat({
      societyId: societyBId,
      wing: 'J',
      flatNumber: '101',
      baseRate: 1700,
      ownerName: 'Job Owner B',
      ownerEmail: `job-owner-b-${suffix}@example.com`,
    });
    flatBId = flatB!.id;
    createdFlatIds.push(flatBId);
  });

  afterAll(async () => {
    // Global cleanup by the distinctive test period, across every society the job
    // touched — not just the two created here.
    await prisma.maintenanceRecord.deleteMany({ where: { period: TEST_PERIOD } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const societyIds = [societyAId, societyBId];
    const userIds = await prisma.user
      .findMany({ where: { societyId: { in: societyIds } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
    await prisma.$disconnect();
  });

  it('generates records for every society for the given period', async () => {
    await runMonthlyMaintenanceGeneration(TEST_PERIOD);

    const recordA = await prisma.maintenanceRecord.findUnique({
      where: { flatId_period: { flatId: flatAId, period: TEST_PERIOD } },
    });
    expect(recordA).not.toBeNull();

    const recordB = await prisma.maintenanceRecord.findUnique({
      where: { flatId_period: { flatId: flatBId, period: TEST_PERIOD } },
    });
    expect(recordB).not.toBeNull();
  });

  it('is idempotent when run twice', async () => {
    await runMonthlyMaintenanceGeneration(TEST_PERIOD);
    const count = await prisma.maintenanceRecord.count({
      where: { flatId: { in: [flatAId, flatBId] }, period: TEST_PERIOD },
    });
    expect(count).toBe(2);
  });
});
