import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import {
  getDashboardSummary,
  getFlaggedFlats,
  getFlatWiseDues,
  getResidentLedgerOverview,
} from '../../../src/features/admin-dashboard/admin-dashboard.service';
import { createFeeType } from '../../../src/features/fee-types/fee-types.service';
import { billOtherCharge } from '../../../src/features/other-charges/other-charges.service';

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
  let flatCId: string; // one SYSTEM charge settled by an approved Deposit, plus a second pending Deposit
  let flatDId: string; // old charge fully settled (Deposit), newer charge unpaid but not yet past grace
  let flatEId: string; // old charge fully settled via approved Credit (not Deposit), newer charge unpaid
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Dashboard Test Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'dash-test@okhdfcbank',
      },
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

    const flatD = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '104',
      baseRate: 1000,
      ownerName: 'Dash Owner D',
      ownerEmail: `dash-owner-d-${suffix}@example.com`,
    });
    flatDId = flatD!.id;
    createdFlatIds.push(flatDId);

    const flatE = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '105',
      baseRate: 1000,
      ownerName: 'Dash Owner E',
      ownerEmail: `dash-owner-e-${suffix}@example.com`,
    });
    flatEId = flatE!.id;
    createdFlatIds.push(flatEId);

    const flatBRow = await prisma.flat.findUniqueOrThrow({ where: { id: flatBId } });
    const flatCRow = await prisma.flat.findUniqueOrThrow({ where: { id: flatCId } });
    const flatDRow = await prisma.flat.findUniqueOrThrow({ where: { id: flatDId } });
    const flatERow = await prisma.flat.findUniqueOrThrow({ where: { id: flatEId } });

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
        // Flat D: an old charge, well past grace, but fully settled below — the
        // escalation check must not key off this one.
        {
          flatId: flatDId,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 800,
          dueDate: daysAgo(60),
          payerId: flatDRow.ownerId,
        },
        // Flat D: a newer, still-unpaid charge, past its due date but within the
        // default 7-day grace period.
        {
          flatId: flatDId,
          period: '2026-02',
          payerType: 'OWNER',
          amount: 800,
          dueDate: daysAgo(2),
          payerId: flatDRow.ownerId,
        },
        // Flat E: an old charge, well past grace, but fully settled via an approved
        // Deposit below.
        {
          flatId: flatEId,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 800,
          dueDate: daysAgo(60),
          payerId: flatERow.ownerId,
        },
        // Flat E: a newer, still-unpaid charge, past its due date but within the
        // default 7-day grace period.
        {
          flatId: flatEId,
          period: '2026-02',
          payerType: 'OWNER',
          amount: 800,
          dueDate: daysAgo(2),
          payerId: flatERow.ownerId,
        },
      ],
    });

    await prisma.ledgerEntry.createMany({
      data: [
        {
          flatId: flatCId,
          payerId: flatCRow.ownerId,
          status: 'APPROVED',
          amount: 800,
          reviewedAt: new Date(),
          createdById: flatCRow.ownerId,
          createdByType: 'OWNER',
        },
        {
          flatId: flatCId,
          payerId: flatCRow.ownerId,
          status: 'PENDING',
          amount: 1200,
          note: 'Second deposit, still awaiting review',
          createdById: flatCRow.ownerId,
          createdByType: 'OWNER',
        },
        {
          flatId: flatDId,
          payerId: flatDRow.ownerId,
          status: 'APPROVED',
          amount: 800,
          reviewedAt: new Date(),
          createdById: flatDRow.ownerId,
          createdByType: 'OWNER',
        },
        {
          flatId: flatEId,
          payerId: flatERow.ownerId,
          status: 'APPROVED',
          amount: 800,
          note: 'Repair cost settled against Jan',
          reviewedAt: new Date(),
          createdById: flatERow.ownerId,
          createdByType: 'OWNER',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.otherCharge.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.feeType.deleteMany({ where: { societyId } });
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
      // totalBilled = 1000(B)+500(B)+800(C)+800(D)+800(D)+800(E)+800(E) = 5500;
      // totalPaid = approvedDeposits — every LedgerEntry is a Deposit now (Credit
      // removed for good, 2026-08-20 pivot) — 800(C) + 800(D) + 800(E) = 2400.
      expect(summary.totalBilled).toBe(5500);
      expect(summary.totalPaid).toBe(2400);
      // outstandingTotal = sum of per-flat Outstanding: A=0, B=1500, C=0 (800 charge
      // fully covered by the approved deposit; the second pending deposit doesn't
      // count), D=800 (one of its two 800 charges covered, the other still open),
      // E=800 (same shape as D).
      expect(summary.outstandingTotal).toBe(3100);
      expect(summary.pendingReviewTotal).toBe(1200); // C's pending deposit
      // collectionRatePercent now reads the same totalPaid figure — 2400/5500.
      expect(summary.collectionRatePercent).toBe(44); // round(2400/5500*100)
    });

    // docs/other-charges/ — a fully separate pool: billing an Other Charge must
    // never move outstandingTotal (maintenance-only), and totalOutstandingTotal
    // must be exactly the sum of the two independently-computed pools.
    it('otherChargesOutstandingTotal/totalOutstandingTotal stay independent of the maintenance pool', async () => {
      const before = await getDashboardSummary(societyId);

      const admin = await prisma.user.create({
        data: {
          name: 'Dashboard Admin',
          email: `dash-admin-${suffix}@example.com`,
          passwordHash: 'x',
          role: 'ADMIN',
          societyId,
        },
      });
      const feeType = await createFeeType(societyId, admin.id, {
        name: `Dashboard Fee ${suffix}`,
      });
      // flatA has zero maintenance charges/entries — a clean pool to bill against.
      await billOtherCharge(societyId, admin.id, { flatId: flatAId, feeTypeId: feeType.id, amount: 4000 });

      const after = await getDashboardSummary(societyId);
      expect(after.outstandingTotal).toBe(before.outstandingTotal); // untouched
      expect(after.otherChargesOutstandingTotal).toBe(before.otherChargesOutstandingTotal + 4000);
      expect(after.totalOutstandingTotal).toBe(after.outstandingTotal + after.otherChargesOutstandingTotal);
    });
  });

  describe('getFlatWiseDues', () => {
    it('includes every flat, even ones with zero dues', async () => {
      const dues = await getFlatWiseDues(societyId);
      const flatA = dues.find((d) => d.flat.id === flatAId);
      expect(flatA).toBeDefined();
      expect(flatA!.outstandingTotal).toBe(0);
      expect(flatA!.creditTotal).toBe(0);
    });

    it("surfaces each flat's Outstanding, sorted highest first", async () => {
      const dues = await getFlatWiseDues(societyId);
      const flatB = dues.find((d) => d.flat.id === flatBId)!;
      const flatC = dues.find((d) => d.flat.id === flatCId)!;
      expect(flatB.outstandingTotal).toBe(1500); // fully unpaid
      expect(flatC.outstandingTotal).toBe(0); // charge fully covered by the approved deposit

      const indexB = dues.findIndex((d) => d.flat.id === flatBId);
      const indexC = dues.findIndex((d) => d.flat.id === flatCId);
      expect(indexB).toBeLessThan(indexC); // 1500 > 0
    });

    it("surfaces each flat's paidTotal as its approvedDeposits", async () => {
      const dues = await getFlatWiseDues(societyId);
      const flatB = dues.find((d) => d.flat.id === flatBId)!;
      const flatC = dues.find((d) => d.flat.id === flatCId)!;
      const flatE = dues.find((d) => d.flat.id === flatEId)!;
      expect(flatB.paidTotal).toBe(0); // nothing paid
      expect(flatC.paidTotal).toBe(800); // the approved deposit, not the pending one
      expect(flatE.paidTotal).toBe(800); // settled via an approved deposit
    });

    it("surfaces each flat's creditTotal as its availableCredit, the flip side of outstandingTotal", async () => {
      const dues = await getFlatWiseDues(societyId);
      // None of the seeded flats here are overpaid, so every creditTotal is 0 — the
      // formula itself (exactly one of outstanding/availableCredit ever nonzero) is
      // exhaustively covered by ledger.service.test.ts's balancesFromRows suite.
      for (const d of dues) {
        expect(d.creditTotal).toBe(0);
        expect(d.creditTotal === 0 || d.outstandingTotal === 0).toBe(true);
      }
    });
  });

  describe('getResidentLedgerOverview', () => {
    it('includes every flat, even ones with zero balances in both pools', async () => {
      const rows = await getResidentLedgerOverview(societyId);
      expect(rows.length).toBeGreaterThanOrEqual(5); // flats A-E
    });

    it("combines a flat's Maintenance figures with its Other Charges outstanding in one row", async () => {
      const rows = await getResidentLedgerOverview(societyId);
      const flatB = rows.find((r) => r.flat.id === flatBId)!;
      const flatC = rows.find((r) => r.flat.id === flatCId)!;
      // Same figures getFlatWiseDues already verified for these flats, just under
      // this function's renamed fields.
      expect(flatB.outstandingMaintenance).toBe(1500);
      expect(flatB.paidMaintenance).toBe(0);
      expect(flatC.outstandingMaintenance).toBe(0);
      expect(flatC.paidMaintenance).toBe(800);

      // flatA was billed 4000 in Other Charges (getDashboardSummary describe block,
      // above) and has zero maintenance charges — confirms the two pools are
      // genuinely independent per row, not accidentally merged into one figure.
      const flatA = rows.find((r) => r.flat.id === flatAId)!;
      expect(flatA.outstandingOtherCharges).toBe(4000);
      expect(flatA.outstandingMaintenance).toBe(0);
      expect(flatB.outstandingOtherCharges).toBe(0); // flat B has no Other Charges billed
    });

    it('sorts by wing then flat number, not by any balance figure', async () => {
      const rows = await getResidentLedgerOverview(societyId);
      const wingDFlats = rows.filter((r) => r.flat.wing === 'D').map((r) => r.flat.flatNumber);
      const sorted = [...wingDFlats].sort();
      expect(wingDFlats).toEqual(sorted);
    });
  });

  describe('getFlaggedFlats', () => {
    it('flags only flats with an Outstanding balance whose oldest charge is past the grace period', async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.map((f) => f.flat.id)).toEqual([flatBId]);
    });

    it("computes the flat's full Outstanding, not just the overdue portion", async () => {
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

    it('never flags a flat with no Outstanding balance, even with an old charge', async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.some((f) => f.flat.id === flatCId)).toBe(false);
    });

    it("keys off the oldest UNSETTLED charge, not the oldest charge overall — flat D's old charge is fully paid, so its still-fresh newer charge (not yet past grace) must not falsely flag it", async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.some((f) => f.flat.id === flatDId)).toBe(false);
    });

    it("flags flat D once its newer (still-unsettled) charge itself passes a shorter grace period, using that charge's own due date and count — not the already-paid older one", async () => {
      const flagged = await getFlaggedFlats(societyId, 1);
      const flatD = flagged.find((f) => f.flat.id === flatDId)!;
      expect(flatD).toBeDefined();
      expect(flatD.outstandingTotal).toBe(800);
      expect(flatD.overdueRecordCount).toBe(1); // only Feb — Jan is PAID, excluded even though it's also "overdue"
    });

    it("does the same for flat E's Jan, settled via an approved Deposit — must not be falsely flagged off it either", async () => {
      const flagged = await getFlaggedFlats(societyId);
      expect(flagged.some((f) => f.flat.id === flatEId)).toBe(false);
    });

    it('flags flat E once its newer charge passes a shorter grace period', async () => {
      const flagged = await getFlaggedFlats(societyId, 1);
      const flatE = flagged.find((f) => f.flat.id === flatEId)!;
      expect(flatE).toBeDefined();
      expect(flatE.outstandingTotal).toBe(800);
      expect(flatE.overdueRecordCount).toBe(1); // only Feb — Jan is PAID, excluded
    });
  });
});
