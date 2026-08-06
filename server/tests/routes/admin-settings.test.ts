import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { createFlat } from '../../src/services/flats.service';
import { generateMaintenanceRecords } from '../../src/services/maintenance-record.service';
import { login } from '../../src/services/auth.service';

describe('/api/admin/settings', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Settings Route Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'settings-route@okhdfcbank',
        tenantRateFactor: 1.5,
        defaultBaseRate: 1500,
      },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Settings Admin',
      email: `settings-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `settings-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;
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
    const res = await request(app).get('/api/admin/settings');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns the current settings for an admin', async () => {
    const res = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tenantRateFactor: 1.5, defaultBaseRate: 1500 });
  });

  it('rejects a non-positive tenantRateFactor with a 400', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantRateFactor: -1 });
    expect(res.status).toBe(400);
  });

  it('updates settings, and generation immediately reflects the new values end to end', async () => {
    const updateRes = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantRateFactor: 2, defaultBaseRate: 1700 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toEqual({ tenantRateFactor: 2, defaultBaseRate: 1700 });

    // A flat onboarded without specifying baseRate still requires it explicitly at the
    // service layer (defaultBaseRate only prefills the admin UI's form) — pass the
    // now-updated defaultBaseRate through explicitly here, exactly as the UI would.
    const flat = await createFlat({
      societyId,
      wing: 'S',
      flatNumber: '101',
      baseRate: 1700,
      ownerName: 'Settings Flat Owner',
      ownerEmail: `settings-flat-owner-${suffix}@example.com`,
      occupancy: 'tenant',
      tenantName: 'Settings Flat Tenant',
      tenantEmail: `settings-flat-tenant-${suffix}@example.com`,
      effectiveFrom: new Date('2020-01-01'),
    });
    createdFlatIds.push(flat!.id);

    const period = '2026-07';
    await generateMaintenanceRecords(societyId, period);
    const record = await prisma.maintenanceRecord.findUniqueOrThrow({
      where: { flatId_period: { flatId: flat!.id, period } },
    });
    // 1700 base rate * the freshly-updated 2x tenant factor = 3400 — proves
    // generateMaintenanceRecords reads the live Society row, not a stale/cached value.
    expect(Number(record.amount)).toBe(3400);
  });
});
