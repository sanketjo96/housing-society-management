import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { getPayerForFlatOnDate } from '../../src/occupancy';

describe('occupancy history and payer lookup', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let tenantId: string;
  let flatId: string;
  let occupancyChangeId: string;

  afterAll(async () => {
    if (occupancyChangeId) await prisma.occupancyChange.delete({ where: { id: occupancyChangeId } });
    if (flatId) await prisma.flat.delete({ where: { id: flatId } });
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (tenantId) await prisma.user.delete({ where: { id: tenantId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('returns the tenant as payer during their occupancy period, owner (null) outside it', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Test Owner',
        email: `owner-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'OWNER',
        societyId: society.id,
      },
    });
    ownerId = owner.id;

    const tenant = await prisma.user.create({
      data: {
        name: 'Test Tenant',
        email: `tenant-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'TENANT',
        societyId: society.id,
      },
    });
    tenantId = tenant.id;

    const flat = await prisma.flat.create({
      data: {
        wing: 'A',
        flatNumber: `101-${suffix}`,
        baseRate: 1000,
        societyId: society.id,
        ownerId: owner.id,
      },
    });
    flatId = flat.id;

    // Tenant moved in on the 11th of the month; no end date yet (ongoing).
    const occupancyChange = await prisma.occupancyChange.create({
      data: {
        flatId: flat.id,
        tenantId: tenant.id,
        effectiveStart: new Date('2026-01-11'),
        effectiveEnd: null,
      },
    });
    occupancyChangeId = occupancyChange.id;

    const duringTenancy = await getPayerForFlatOnDate(flat.id, new Date('2026-01-15'));
    expect(duringTenancy).toBe(tenant.id);

    const beforeTenancy = await getPayerForFlatOnDate(flat.id, new Date('2026-01-05'));
    expect(beforeTenancy).toBeNull();
  });
});
