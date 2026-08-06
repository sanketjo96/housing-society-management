import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createFlat } from '../../src/services/flats.service';
import { getDashboardSummary, getFlaggedFlats, getFlatWiseDues } from '../../src/services/admin-dashboard.service';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

describe('admin-dashboard service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatAId: string; // no records or ledger entries at all
  let flatBId: string; // two SYSTEM charges, an old overdue one and a recent one, nothing paid
  let flatCId: string; // one SYSTEM charge settled by an approved Deposit, plus a pending Credit
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

    const flatBRow = await prisma.flat.findUniqueOrThrow({ where: { id: flatBId } });
    const flatCRow = await prisma.flat.findUniqueOrThrow({ where: { id: flatCId } });

    await prisma.maintenanceRecord.createMany({
      data: [
        // Flat B: overdue past the default 7-day grace period.
        {
          flatId: flatBId,
          period: '2026-01',
          payerType: 'TENANT',
          amount: 1000,
          dueDate: daysAgo(30),
          payerId: flatBRow.currentTenantId!,
        },
        // Flat B: past due date, but still within the default grace period.
        {
          flatId: flatBId,
          period: '2026-02',
          payerType: 'TENANT',
          amount: 500,
          dueDate: daysAgo(2),
          payerId: flatBRow.currentTenantId!,
        },
        // Flat C: settled by an approved Deposit below.
        {
          flatId: flatCId,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 800,
          dueDate: daysAgo(60),
          payerId: flatCRow.ownerId,
        },
      ],
    });

    await prisma.ledgerEntry.createMany({
      data: [
        {
          flatId: flatCId,
          payerId: flatCRow.ownerId,
          type: 'DEPOSIT',
          status: 'APPROVED',
          amount: 800,
          reviewedAt: new Date(),
        },
        {
          flatId: flatCId,
          payerId: flatCRow.ownerId,
          type: 'CREDIT',
          status: 'PENDING',
          amount: 1200,
          note: 'Pending expense reimbursement claim',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
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
    it('computes totals and collection rate across every flat', async () => {
      const summary = await getDashboardSummary(societyId);
      // totalBilled = 1000(B) + 500(B) + 800(C) = 2300; totalPaid = 800(C's deposit).
      expect(summary.totalBilled).toBe(2300);
      expect(summary.totalPaid).toBe(800);
      // outstandingTotal = sum of per-flat Payable: A=0, B=1500 (no credit), C=0
      // (800 charge fully covered by the 800 deposit; the pending Credit doesn't count).
      expect(summary.outstandingTotal).toBe(1500);
      expect(summary.pendingReviewTotal).toBe(1200); // C's pending Credit
      expect(summary.collectionRatePercent).toBe(35); // round(800/2300*100)
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

    it("surfaces each flat's Payable, sorted highest first, with pending-entry counts", async () => {
      const dues = await getFlatWiseDues(societyId);
      const flatB = dues.find((d) => d.flat.id === flatBId)!;
      const flatC = dues.find((d) => d.flat.id === flatCId)!;
      expect(flatB.outstandingTotal).toBe(1500); // fully unpaid, no credit
      expect(flatB.unpaidCount).toBe(0); // no pending LedgerEntry rows
      expect(flatC.outstandingTotal).toBe(0); // charge fully covered by the approved deposit
      expect(flatC.unpaidCount).toBe(1); // the pending Credit

      const indexB = dues.findIndex((d) => d.flat.id === flatBId);
      const indexC = dues.findIndex((d) => d.flat.id === flatCId);
      expect(indexB).toBeLessThan(indexC); // 1500 > 0
    });
  });

  describe('getFlaggedFlats', () => {
    it('flags only flats with a Payable balance whose oldest charge is past the grace period', async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.map((f) => f.flat.id)).toEqual([flatBId]);
    });

    it("computes the flat's full Payable, not just the overdue portion", async () => {
      const flagged = await getFlaggedFlats(societyId);
      const flatB = flagged.find((f) => f.flat.id === flatBId)!;
      expect(flatB.outstandingTotal).toBe(1500); // both charges, not just the overdue one
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
      expect(flatB.overdueRecordCount).toBe(2); // both charges are now past a 1-day grace
    });

    it('flags nothing with a very long grace period', async () => {
      const flagged = await getFlaggedFlats(societyId, 365);
      expect(flagged).toHaveLength(0);
    });

    it('never flags a flat with no Payable balance, even with an old charge', async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.some((f) => f.flat.id === flatCId)).toBe(false);
    });
  });
});
