import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { login } from '../../../src/features/auth/auth.service';
import { generateMaintenanceRecords } from '../../../src/features/maintenance/maintenance-record.service';

describe('GET /api/admin/maintenance-records', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  let flatAId: string;
  let flatBId: string;
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
      email: `amr-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `amr-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const flatA = await createFlat({
      societyId,
      wing: 'A',
      flatNumber: '1',
      baseRate: 1000,
      ownerName: 'AMR Owner A',
      ownerEmail: `amr-owner-a-${suffix}@example.com`,
    });
    flatAId = flatA!.id;
    createdFlatIds.push(flatAId);

    const flatB = await createFlat({
      societyId,
      wing: 'B',
      flatNumber: '1',
      baseRate: 1200,
      ownerName: 'AMR Owner B',
      ownerEmail: `amr-owner-b-${suffix}@example.com`,
    });
    flatBId = flatB!.id;
    createdFlatIds.push(flatBId);

    await generateMaintenanceRecords(societyId, '2026-04');
    await generateMaintenanceRecords(societyId, '2026-05');
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
    const res = await request(app).get('/api/admin/maintenance-records');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .get('/api/admin/maintenance-records')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns every record in the society with flat and payer info', async () => {
    const res = await request(app)
      .get('/api/admin/maintenance-records')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body[0].flat).toBeDefined();
    expect(res.body[0].payer.name).toBeDefined();
  });

  it('filters by period', async () => {
    const res = await request(app)
      .get('/api/admin/maintenance-records?period=2026-04')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((r: { period: string }) => r.period === '2026-04')).toBe(true);
  });

  it('filters by flatId', async () => {
    const res = await request(app)
      .get(`/api/admin/maintenance-records?flatId=${flatAId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((r: { flatId: string }) => r.flatId === flatAId)).toBe(true);
  });
});
