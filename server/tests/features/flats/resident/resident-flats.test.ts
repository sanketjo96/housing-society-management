import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { login } from '../../../../src/features/auth/auth.service';

describe('/api/me/flat endpoints', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  let ownerId: string;
  let tenantToken: string;
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
      email: `me-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Owner Original',
      email: `me-route-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerId = owner.id;
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const tenantPassword = 'tenant-password-123';
    const tenant = await createUser({
      name: 'Tenant Original',
      email: `me-route-tenant-${suffix}@example.com`,
      password: tenantPassword,
      role: 'TENANT',
      societyId,
    });
    createdUserIds.push(tenant.id);
    tenantToken = (await login({ email: tenant.email, password: tenantPassword })).accessToken;

    // ownerName/ownerEmail (not ownerId) — findOrCreateUserByEmail resolves this back
    // to the already-created `owner` account (matching email), so ownerToken still
    // belongs to whoever owns this flat.
    const flatRes = await request(app)
      .post('/api/admin/flats')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        wing: 'M',
        flatNumber: '101',
        baseRate: 1500,
        ownerName: owner.name,
        ownerEmail: owner.email,
      });
    flatId = flatRes.body.id;
    createdFlatIds.push(flatId);
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    // Query every user in this society rather than relying on createdUserIds alone —
    // PUT /api/me/flat's self-service tenant find-or-create (like PUT
    // /api/me/flat/tenant's) creates accounts inline that this array never tracked.
    const allUserIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.refreshToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  describe('GET /api/me/flat', () => {
    it('rejects a request with no access token (401)', async () => {
      const res = await request(app).get('/api/me/flat');
      expect(res.status).toBe(401);
    });

    it('returns the flat the caller owns', async () => {
      const res = await request(app)
        .get('/api/me/flat')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(flatId);
      expect(res.body.currentTenant).toBeNull();
    });

    it('returns 404 for a role with no associated flat (e.g. the tenant, before assignment)', async () => {
      const res = await request(app)
        .get('/api/me/flat')
        .set('Authorization', `Bearer ${tenantToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/me/flat', () => {
    it('rejects a request with no access token (401)', async () => {
      const res = await request(app)
        .put('/api/me/flat')
        .send({ ownerName: 'X', ownerEmail: 'x@example.com' });
      expect(res.status).toBe(401);
    });

    it('rejects a non-OWNER token (403) — a TENANT has no flat-level access', async () => {
      const res = await request(app)
        .put('/api/me/flat')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ ownerName: 'X', ownerEmail: 'x@example.com' });
      expect(res.status).toBe(403);
    });

    it('updates owner contact details, and separately opens a tenant occupancy, in one combined request', async () => {
      const res = await request(app)
        .put('/api/me/flat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          ownerName: 'Owner Updated',
          ownerEmail: (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).email,
          occupancy: 'tenant',
          tenantName: 'Self-Service Tenant',
          tenantEmail: `me-flat-tenant-${suffix}@example.com`,
        });
      expect(res.status).toBe(200);
      expect(res.body.owner.name).toBe('Owner Updated');
      expect(res.body.currentTenant.name).toBe('Self-Service Tenant');

      // Revert to owner-occupied so later GET /api/me/flat assertions above aren't
      // affected by test ordering.
      const revert = await request(app)
        .put('/api/me/flat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ownerName: 'Owner Updated', ownerEmail: res.body.owner.email, occupancy: 'owner' });
      expect(revert.status).toBe(200);
      expect(revert.body.currentTenant).toBeNull();
    });

    it('never accepts wing/flatNumber/baseRate — stays admin-set and read-only', async () => {
      const before = await request(app)
        .get('/api/me/flat')
        .set('Authorization', `Bearer ${ownerToken}`);
      const res = await request(app)
        .put('/api/me/flat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ownerName: 'Owner Updated', ownerEmail: before.body.owner.email, baseRate: 99999 });
      expect(res.status).toBe(200);
      expect(Number(res.body.baseRate)).toBe(Number(before.body.baseRate));
    });
  });

  describe('PUT /api/me/flat/tenant', () => {
    it('rejects a non-OWNER token (403)', async () => {
      const res = await request(app)
        .put('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ name: 'A Tenant', email: `put-nope-${suffix}@example.com` });
      expect(res.status).toBe(403);
    });

    it('creates a tenant and associates them with the caller’s own flat', async () => {
      const email = `put-tenant-${suffix}@example.com`;
      const res = await request(app)
        .put('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Brand New Tenant', email });

      expect(res.status).toBe(200);
      expect(res.body.currentTenant.email).toBe(email);
      createdUserIds.push(res.body.currentTenantId);
    });

    it('updates the existing tenant in place on a second call, rather than rejecting', async () => {
      const email = `put-tenant-${suffix}@example.com`;
      const res = await request(app)
        .put('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Renamed Tenant', email });

      expect(res.status).toBe(200);
      expect(res.body.currentTenant.name).toBe('Renamed Tenant');
    });

    it('rejects invalid input with a 400', async () => {
      const res = await request(app)
        .put('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'X', email: 'not-an-email' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/me/flat/tenant', () => {
    it('rejects a non-OWNER token (403)', async () => {
      const res = await request(app)
        .delete('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${tenantToken}`);
      expect(res.status).toBe(403);
    });

    it('removes the current tenant given a valid owner token', async () => {
      const res = await request(app)
        .delete('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.currentTenantId).toBeNull();
    });

    it('rejects removal when the flat is already owner-occupied (409)', async () => {
      const res = await request(app)
        .delete('/api/me/flat/tenant')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(409);
    });
  });
});
