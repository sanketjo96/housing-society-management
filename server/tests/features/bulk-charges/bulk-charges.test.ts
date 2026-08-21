import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin/admin-users-service';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { login } from '../../../src/features/auth/auth.service';

describe('POST /api/admin/bulk-charges/import', () => {
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
      data: { name: `Bulk Charges Route Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Route Admin',
      email: `bulk-charges-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const nonAdmin = await createUser({
      name: 'Non-Admin Caller',
      email: `bulk-charges-route-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(nonAdmin.id);
    ownerToken = (await login({ email: nonAdmin.email, password: ownerPassword })).accessToken;

    const flat = await createFlat({
      societyId,
      wing: 'R',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Route Owner',
      ownerEmail: `bulk-charges-route-owner-${suffix}@example.com`,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    createdFlatIds.push(flatId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [...createdUserIds, ownerId] } } });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: [...createdUserIds, ownerId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds, ownerId] } } });
    await prisma.society.delete({ where: { id: societyId } });
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-charges/import')
      .send({ csv: 'wing,flatnumber,pool,amount\nR,101,MAINTENANCE_OPENING_BALANCE,100' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-charges/import')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ csv: 'wing,flatnumber,pool,amount\nR,101,MAINTENANCE_OPENING_BALANCE,100' });
    expect(res.status).toBe(403);
  });

  it('imports a valid row given a valid admin token (200)', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-charges/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv: 'wing,flatnumber,pool,amount\nR,101,MAINTENANCE_OPENING_BALANCE,12345' });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(0);
  });

  it('rejects an empty csv field with a 400', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-charges/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv: '' });
    expect(res.status).toBe(400);
  });
});
