import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { createFlat } from '../../src/services/flats.service';
import { login } from '../../src/services/auth.service';

describe('POST /api/admin/maintenance-records/generate', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
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
      email: `gen-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `gen-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const flat = await createFlat({
      societyId,
      block: 'G',
      flatNumber: '101',
      baseRate: 1800,
      ownerName: 'Gen Flat Owner',
      ownerEmail: `gen-flat-owner-${suffix}@example.com`,
    });
    flatId = flat!.id;
    createdFlatIds.push(flatId);
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
    const res = await request(app).post('/api/admin/maintenance-records/generate').send({ period: '2026-07' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance-records/generate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ period: '2026-07' });
    expect(res.status).toBe(403);
  });

  it('generates records for the given period, given a valid admin token', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance-records/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ period: '2026-07' });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.period).toBe('2026-07');

    const record = await prisma.maintenanceRecord.findUnique({
      where: { flatId_period: { flatId, period: '2026-07' } },
    });
    expect(record).not.toBeNull();
  });

  it('is idempotent through the endpoint too', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance-records/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ period: '2026-07' });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toBe(1);
  });

  it('defaults to the current period when none is given', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance-records/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('rejects a malformed period with a 400', async () => {
    const res = await request(app)
      .post('/api/admin/maintenance-records/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ period: 'not-a-period' });
    expect(res.status).toBe(400);
  });
});
