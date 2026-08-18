import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';
import { createFlat } from '../../../src/features/flats/admin/onboarding.service';
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
