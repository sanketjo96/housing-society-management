import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createFlat, listFlats } from '../../../../src/features/flats/admin/admin-flats-onboarding-service';

describe('flats service — listFlats', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  const ownerEmail = `list-owner-${suffix}@example.com`;
  const tenantEmail = `list-tenant-${suffix}@example.com`;
  const otherOwnerEmail = `list-other-owner-${suffix}@example.com`;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Test St', upiVpa: 'other@okhdfcbank' },
    });
    otherSocietyId = otherSociety.id;

    const flatA = await createFlat({
      societyId,
      wing: 'L',
      flatNumber: '101',
      baseRate: 1500,
      ownerName: 'Test Owner',
      ownerEmail,
      occupancy: 'tenant',
      tenantName: 'Test Tenant',
      tenantEmail,
    });
    createdFlatIds.push(flatA!.id);

    // Reuses the same owner account by email — proves listFlats doesn't depend on
    // each flat having a distinct owner.
    const flatB = await createFlat({
      societyId,
      wing: 'L',
      flatNumber: '102',
      baseRate: 1600,
      ownerName: 'Test Owner',
      ownerEmail,
    });
    createdFlatIds.push(flatB!.id);

    const otherFlat = await createFlat({
      societyId: otherSocietyId,
      wing: 'L',
      flatNumber: '101',
      baseRate: 1700,
      ownerName: 'Other Society Owner',
      ownerEmail: otherOwnerEmail,
    });
    createdFlatIds.push(otherFlat!.id);
  });

  afterAll(async () => {
    const societyIds = [societyId, otherSocietyId];
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = await prisma.user
      .findMany({ where: { societyId: { in: societyIds } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
    await prisma.$disconnect();
  });

  it('lists only flats in the given society, with owner and currentTenant summaries', async () => {
    const flats = await listFlats(societyId);

    expect(flats).toHaveLength(2);
    expect(flats.every((f) => f.societyId === societyId)).toBe(true);

    const tenanted = flats.find((f) => f.flatNumber === '101');
    expect(tenanted?.owner.email).toBe(ownerEmail);
    expect(tenanted?.currentTenant?.email).toBe(tenantEmail);

    const untenanted = flats.find((f) => f.flatNumber === '102');
    expect(untenanted?.owner.email).toBe(ownerEmail);
    expect(untenanted?.currentTenant).toBeNull();
  });

  it('does not include flats from a different society', async () => {
    const flats = await listFlats(societyId);
    expect(flats.some((f) => f.societyId === otherSocietyId)).toBe(false);
  });
});
