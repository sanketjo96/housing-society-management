import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin/admin-users-service';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { login } from '../../../src/features/auth/auth.service';

describe('/api/admin/dashboard/*', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Dashboard Route Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'dash-route@okhdfcbank',
      },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Dashboard Route Admin',
      email: `dash-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Dashboard Route Owner',
      email: `dash-route-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const flat = await createFlat({
      societyId,
      wing: 'R',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Dashboard Flat Owner',
      ownerEmail: `dash-flat-owner-${suffix}@example.com`,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    createdFlatIds.push(flatId);

    const overdueDueDate = new Date();
    overdueDueDate.setDate(overdueDueDate.getDate() - 30);

    // No LedgerEntry (Deposit) covers this charge, so the flat's Payable stays
    // positive with no explicit "status" needed — every MaintenanceRecord is always
    // implicitly Approved under the ledger pivot (CLAUDE.md's ledger pivot note).
    await prisma.maintenanceRecord.create({
      data: {
        flatId,
        period: '2026-01',
        payerType: 'OWNER',
        amount: 1000,
        dueDate: overdueDueDate,
        payerId: ownerId,
      },
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.societyLedgerEntry.deleteMany({ where: { societyId } });
    await prisma.societyLedgerCategory.deleteMany({ where: { societyId } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    const allUserIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  describe('GET /api/admin/dashboard/summary', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('returns the society-wide summary', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.outstandingTotal).toBe(1000);
      expect(res.body.totalBilled).toBe(1000);
      expect(res.body.collectionRatePercent).toBe(0);
      expect(res.body.availableYears).toContain(2026);
    });

    it('rejects a malformed year (400)', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/summary?year=not-a-number')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('scopes outstandingTotal/totalBilled and society Finance totals to the given year; counts/availableYears stay untouched', async () => {
      // A second flat's charge, and a society-level income entry, both dated 2025 —
      // distinct from the shared 2026-01 fixture above.
      const flat2025 = await createFlat({
        societyId,
        wing: 'R',
        flatNumber: '102',
        baseRate: 500,
        ownerName: 'Dashboard 2025 Owner',
        ownerEmail: `dash-2025-owner-${suffix}@example.com`,
      });
      createdFlatIds.push(flat2025!.id);
      await prisma.maintenanceRecord.create({
        data: {
          flatId: flat2025!.id,
          period: '2025-06',
          payerType: 'OWNER',
          amount: 700,
          dueDate: new Date('2025-06-15'),
          payerId: flat2025!.ownerId,
        },
      });

      const category = await prisma.societyLedgerCategory.create({
        data: { societyId, name: `Dash Year Test ${suffix}`, direction: 'INCOME' },
      });
      await prisma.societyLedgerEntry.create({
        data: {
          societyId,
          categoryId: category.id,
          recordedById: (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN', societyId } })).id,
          direction: 'INCOME',
          amount: 5000,
          transactionDate: new Date('2025-03-01'),
          paymentMethod: 'CASH',
        },
      });

      const res2025 = await request(app)
        .get('/api/admin/dashboard/summary?year=2025')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2025.body.outstandingTotal).toBe(700); // only the 2025-06 charge
      expect(res2025.body.totalBilled).toBe(700);
      expect(res2025.body.societyTotalIncome).toBe(5000);

      const res2026 = await request(app)
        .get('/api/admin/dashboard/summary?year=2026')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2026.body.outstandingTotal).toBe(1000); // unaffected by the 2025 data
      expect(res2026.body.societyTotalIncome).toBe(0);

      const resAll = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAll.body.outstandingTotal).toBe(1700); // lifetime sum, both years
      expect(resAll.body.societyTotalIncome).toBe(5000);
      expect([...resAll.body.availableYears]).toEqual(expect.arrayContaining([2025, 2026]));
      // Same lifetime availableYears regardless of which year was asked for.
      expect([...res2025.body.availableYears]).toEqual([...resAll.body.availableYears]);
    });

    it('societyTotalIncome/societyNetPosition include approved maintenance deposits, not just SocietyLedgerEntry income', async () => {
      const before = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      const flat = await createFlat({
        societyId,
        wing: 'R',
        flatNumber: '103',
        baseRate: 1000,
        ownerName: 'Dashboard Income Owner',
        ownerEmail: `dash-income-owner-${suffix}@example.com`,
      });
      createdFlatIds.push(flat!.id);
      await prisma.maintenanceRecord.create({
        data: {
          flatId: flat!.id,
          period: '2026-03',
          payerType: 'OWNER',
          amount: 1000,
          dueDate: new Date('2026-03-15'),
          payerId: flat!.ownerId,
        },
      });
      await prisma.ledgerEntry.create({
        data: {
          flatId: flat!.id,
          payerId: flat!.ownerId,
          status: 'APPROVED',
          amount: 1000,
          reviewedAt: new Date(),
          createdById: flat!.ownerId,
          createdByType: 'OWNER',
        },
      });

      const after = await request(app)
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      // societyTotalIncome moved by exactly the new approved deposit — the
      // SocietyLedgerEntry-only figure (societyTotalExpense) is untouched.
      expect(after.body.societyTotalIncome).toBe(before.body.societyTotalIncome + 1000);
      expect(after.body.totalPaid).toBe(before.body.totalPaid + 1000);
      expect(after.body.societyTotalExpense).toBe(before.body.societyTotalExpense);
      // Net = societyTotalIncome (already inclusive of paid maintenance) − expense.
      expect(after.body.societyNetPosition).toBe(after.body.societyTotalIncome - after.body.societyTotalExpense);
      expect(after.body.societyNetPosition).toBe(before.body.societyNetPosition + 1000);
    });
  });

  describe('GET /api/admin/dashboard/flat-dues', () => {
    it('returns flat-wise dues including the owner/tenant contact info', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/flat-dues')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const row = res.body.find((r: { flat: { id: string } }) => r.flat.id === flatId);
      expect(row.outstandingTotal).toBe(1000);
      expect(row.owner.id).toBe(ownerId);
    });
  });

  describe('GET /api/admin/dashboard/resident-ledger', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/resident-ledger')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it("returns every flat's Maintenance and Other Charges figures in one row", async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/resident-ledger')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const row = res.body.find((r: { flat: { id: string } }) => r.flat.id === flatId);
      expect(row.outstandingMaintenance).toBe(1000);
      expect(row.paidMaintenance).toBe(0);
      expect(row.creditMaintenance).toBe(0);
      expect(row.outstandingOtherCharges).toBe(0);
      expect(row.owner.id).toBe(ownerId);
    });
  });

  describe('GET /api/admin/dashboard/flagged-flats', () => {
    it('flags the overdue flat by default', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/flagged-flats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((f: { flat: { id: string } }) => f.flat.id === flatId)).toBe(true);
      const row = res.body.find((f: { flat: { id: string } }) => f.flat.id === flatId);
      expect(row.message).toContain('R-101');
    });

    it('accepts a gracePeriodDays override', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/flagged-flats?gracePeriodDays=365')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((f: { flat: { id: string } }) => f.flat.id === flatId)).toBe(false);
    });

    it('rejects a malformed gracePeriodDays with a 400', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/flagged-flats?gracePeriodDays=not-a-number')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });
});
