import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createFlat } from '../../src/services/flats.service';
import { getDashboardSummary, getFlaggedFlats, getFlatWiseDues } from '../../src/services/admin-dashboard.service';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

describe('admin-dashboard service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatAId: string; // no records at all
  let flatBId: string; // two UNPAID records: one overdue past default grace, one not
  let flatCId: string; // one PAID, one PENDING_REVIEW
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Dashboard Test Society ${suffix}`, address: '1 Test St', upiVpa: 'dash-test@okhdfcbank' },
    });
    societyId = society.id;

    const flatA = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Dash Owner A',
      ownerEmail: `dash-owner-a-${suffix}@example.com`,
    });
    flatAId = flatA!.id;
    createdFlatIds.push(flatAId);

    const flatB = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '102',
      baseRate: 1000,
      ownerName: 'Dash Owner B',
      ownerEmail: `dash-owner-b-${suffix}@example.com`,
      occupancy: 'tenant',
      tenantName: 'Dash Tenant B',
      tenantEmail: `dash-tenant-b-${suffix}@example.com`,
      effectiveFrom: new Date('2020-01-01'),
    });
    flatBId = flatB!.id;
    createdFlatIds.push(flatBId);

    const flatC = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '103',
      baseRate: 1000,
      ownerName: 'Dash Owner C',
      ownerEmail: `dash-owner-c-${suffix}@example.com`,
    });
    flatCId = flatC!.id;
    createdFlatIds.push(flatCId);

    const flatBOwner = await prisma.flat.findUniqueOrThrow({ where: { id: flatBId } });

    await prisma.maintenanceRecord.createMany({
      data: [
        // Flat B: overdue past the default 7-day grace period.
        {
          flatId: flatBId,
          period: '2026-01',
          payerType: 'TENANT',
          amount: 1000,
          status: 'UNPAID',
          dueDate: daysAgo(30),
          payerId: flatBOwner.currentTenantId!,
        },
        // Flat B: past due date, but still within the default grace period.
        {
          flatId: flatBId,
          period: '2026-02',
          payerType: 'TENANT',
          amount: 500,
          status: 'UNPAID',
          dueDate: daysAgo(2),
          payerId: flatBOwner.currentTenantId!,
        },
        // Flat C: settled.
        {
          flatId: flatCId,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 800,
          status: 'PAID',
          dueDate: daysAgo(60),
          payerId: flatBOwner.ownerId, // any valid user id in-society; payer identity isn't under test here
        },
        // Flat C: mid-review.
        {
          flatId: flatCId,
          period: '2026-02',
          payerType: 'OWNER',
          amount: 1200,
          status: 'PENDING_REVIEW',
          dueDate: daysFromNow(5),
          payerId: flatBOwner.ownerId,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  describe('getDashboardSummary', () => {
    it('computes totals and collection rate across every record', async () => {
      const summary = await getDashboardSummary(societyId);
      expect(summary.totalPaid).toBe(800);
      expect(summary.outstandingTotal).toBe(1500);
      expect(summary.pendingReviewTotal).toBe(1200);
      expect(summary.totalBilled).toBe(3500);
      expect(summary.collectionRatePercent).toBe(23); // round(800/3500*100)
    });
  });

  describe('getFlatWiseDues', () => {
    it('includes every flat, even ones with zero dues', async () => {
      const dues = await getFlatWiseDues(societyId);
      const flatA = dues.find((d) => d.flat.id === flatAId);
      expect(flatA).toBeDefined();
      expect(flatA!.outstandingTotal).toBe(0);
      expect(flatA!.unpaidCount).toBe(0);
    });

    it('sums UNPAID and PENDING_REVIEW together per flat, sorted highest first', async () => {
      const dues = await getFlatWiseDues(societyId);
      const flatB = dues.find((d) => d.flat.id === flatBId)!;
      const flatC = dues.find((d) => d.flat.id === flatCId)!;
      expect(flatB.outstandingTotal).toBe(1500);
      expect(flatB.unpaidCount).toBe(2);
      expect(flatC.outstandingTotal).toBe(1200);
      expect(flatC.unpaidCount).toBe(1);

      const indexB = dues.findIndex((d) => d.flat.id === flatBId);
      const indexC = dues.findIndex((d) => d.flat.id === flatCId);
      expect(indexB).toBeLessThan(indexC); // 1500 > 1200
    });
  });

  describe('getFlaggedFlats', () => {
    it('flags only flats with an UNPAID record past the grace period', async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.map((f) => f.flat.id)).toEqual([flatBId]);
    });

    it("computes the flat's full outstanding total, not just the overdue portion", async () => {
      const flagged = await getFlaggedFlats(societyId);
      const flatB = flagged.find((f) => f.flat.id === flatBId)!;
      expect(flatB.outstandingTotal).toBe(1500); // both UNPAID records, not just the overdue one
      expect(flatB.overdueRecordCount).toBe(1); // only the 30-days-ago one is past the 7-day grace
    });

    it('addresses the message to the current tenant, not the owner, when one is assigned', async () => {
      const flagged = await getFlaggedFlats(societyId);
      const flatB = flagged.find((f) => f.flat.id === flatBId)!;
      expect(flatB.recipient.name).toBe('Dash Tenant B');
      expect(flatB.message).toContain('Dash Tenant B');
      expect(flatB.message).toContain('D-102');
      expect(flatB.message).toContain('1,500');
    });

    it('respects a shorter custom grace period', async () => {
      const flagged = await getFlaggedFlats(societyId, 1);
      const flatB = flagged.find((f) => f.flat.id === flatBId)!;
      expect(flatB.overdueRecordCount).toBe(2); // both records are now past a 1-day grace
    });

    it('flags nothing with a very long grace period', async () => {
      const flagged = await getFlaggedFlats(societyId, 365);
      expect(flagged).toHaveLength(0);
    });
  });
});
