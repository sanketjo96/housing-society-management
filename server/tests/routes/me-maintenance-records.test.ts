import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { createFlat } from '../../src/services/flats.service';
import { login } from '../../src/services/auth.service';
import { generateMaintenanceRecords } from '../../src/services/maintenance-record.service';

describe('GET /api/me/maintenance-records', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerToken: string;
  let ownerId: string;
  let adminToken: string;
  let flatId: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Test Admin',
      email: `mr-me-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const ownerEmail = `mr-me-owner-${suffix}@example.com`;
    const flat = await createFlat({
      societyId,
      block: 'R',
      flatNumber: '101',
      baseRate: 1500,
      ownerName: 'MR Me Owner',
      ownerEmail,
    });
    flatId = flat!.id;
    createdFlatIds.push(flatId);
    ownerId = flat!.ownerId;
    createdUserIds.push(ownerId);
    // Owner account was provisioned inline by createFlat with a random password —
    // reset it directly in the DB so this test can log in as them.
    const bcrypt = await import('bcrypt');
    await prisma.user.update({
      where: { id: ownerId },
      data: { passwordHash: await bcrypt.hash(ownerPassword, 10) },
    });
    ownerToken = (await login({ email: ownerEmail, password: ownerPassword })).accessToken;

    await generateMaintenanceRecords(societyId, '2026-05');
    await generateMaintenanceRecords(societyId, '2026-06');
  });

  afterAll(async () => {
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
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

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app).get('/api/me/maintenance-records');
    expect(res.status).toBe(401);
  });

  it('rejects an ADMIN token (403) — an admin is not a payer', async () => {
    const res = await request(app)
      .get('/api/me/maintenance-records')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns the owner's own records, newest period first, with flat info", async () => {
    const res = await request(app)
      .get('/api/me/maintenance-records')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].period).toBe('2026-06');
    expect(res.body[1].period).toBe('2026-05');
    expect(res.body[0].status).toBe('UNPAID');
    expect(res.body[0].flat.block).toBe('R');
    expect(res.body[0].flat.flatNumber).toBe('101');
  });
});
