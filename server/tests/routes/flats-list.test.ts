import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

describe('GET /api/admin/flats', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];
  const flatOwnerEmail = `list-route-flat-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Test Admin',
      email: `list-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `list-route-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const flat = await request(app)
      .post('/api/admin/flats')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ wing: 'L', flatNumber: '901', baseRate: 1500, ownerName: 'Flat Owner', ownerEmail: flatOwnerEmail });
    createdFlatIds.push(flat.body.id);
  });

  afterAll(async () => {
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    const flatOwner = await prisma.user.findUnique({ where: { email: flatOwnerEmail }, select: { id: true } });
    const allUserIds = [...createdUserIds, ...(flatOwner ? [flatOwner.id] : [])];
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app).get('/api/admin/flats');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app).get('/api/admin/flats').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('lists flats in the admin’s society given a valid admin token', async () => {
    const res = await request(app).get('/api/admin/flats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const flat = res.body.find((f: { id: string }) => f.id === createdFlatIds[0]);
    expect(flat.owner.email).toBe(flatOwnerEmail);
    expect(flat.currentTenant).toBeNull();
  });
});
