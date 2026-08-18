import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { login } from '../../../../src/features/auth/auth.service';

describe('Flat tenant assignment endpoints', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  let ownerId: string;
  let tenantId: string;
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
      email: `tenant-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Test Owner',
      email: `tenant-route-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerId = owner.id;
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const tenant = await createUser({
      name: 'Test Tenant',
      email: `tenant-route-tenant-${suffix}@example.com`,
      password: 'password-123',
      role: 'TENANT',
      societyId,
    });
    createdUserIds.push(tenant.id);
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    // createTestFlat provisions its own owner inline per call (not tracked one by one
    // in createdUserIds) — sweep the whole society instead.
    const allUserIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  async function createTestFlat(flatNumber: string) {
    const res = await request(app)
      .post('/api/admin/flats')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        wing: 'T',
        flatNumber,
        baseRate: 1500,
        ownerName: `Flat Owner ${flatNumber}`,
        ownerEmail: `tenant-route-flat-owner-${flatNumber}-${suffix}@example.com`,
      });
    createdFlatIds.push(res.body.id);
    return res.body.id as string;
  }

  describe('POST /api/admin/flats/:id/tenant', () => {
    it('rejects a request with no access token (401)', async () => {
      const flatId = await createTestFlat('101');
      const res = await request(app).post(`/api/admin/flats/${flatId}/tenant`).send({ tenantId });
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin token (403)', async () => {
      const flatId = await createTestFlat('102');
      const res = await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tenantId });
      expect(res.status).toBe(403);
    });

    it('assigns a tenant given a valid admin token', async () => {
      const flatId = await createTestFlat('103');
      const res = await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId });

      expect(res.status).toBe(200);
      expect(res.body.currentTenantId).toBe(tenantId);
    });

    it('rejects invalid input with a 400', async () => {
      const flatId = await createTestFlat('104');
      const res = await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects a tenantId that does not reference a TENANT in this society (400)', async () => {
      const flatId = await createTestFlat('105');
      const res = await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId: ownerId });
      expect(res.status).toBe(400);
    });

    it('rejects assigning a tenant when one is already assigned (409)', async () => {
      const flatId = await createTestFlat('106');
      const first = await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId });
      expect(second.status).toBe(409);
    });

    it('returns 404 for a nonexistent flat', async () => {
      const res = await request(app)
        .post('/api/admin/flats/nonexistent-id/tenant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/flats/:id/tenant', () => {
    async function createTenantedFlat(flatNumber: string) {
      const flatId = await createTestFlat(flatNumber);
      await request(app)
        .post(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId });
      return flatId;
    }

    it('rejects a request with no access token (401)', async () => {
      const flatId = await createTenantedFlat('201');
      const res = await request(app).delete(`/api/admin/flats/${flatId}/tenant`);
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin token (403)', async () => {
      const flatId = await createTenantedFlat('202');
      const res = await request(app)
        .delete(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('removes the current tenant given a valid admin token', async () => {
      const flatId = await createTenantedFlat('203');
      const res = await request(app)
        .delete(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.currentTenantId).toBeNull();
    });

    it('rejects removing a tenant from an owner-occupied flat (409)', async () => {
      const flatId = await createTestFlat('204');
      const res = await request(app)
        .delete(`/api/admin/flats/${flatId}/tenant`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('returns 404 for a nonexistent flat', async () => {
      const res = await request(app)
        .delete('/api/admin/flats/nonexistent-id/tenant')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
