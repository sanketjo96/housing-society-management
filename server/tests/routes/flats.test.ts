import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

// Owner is a contact field (name/email), not a pre-existing ownerId — createFlat
// find-or-creates the account inline (CLAUDE.md's "Addition (2026-08-06)").
describe('Flats admin endpoints', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];
  let ownerCounter = 0;

  function ownerFields() {
    ownerCounter += 1;
    return { ownerName: `Test Owner ${ownerCounter}`, ownerEmail: `flats-inline-owner-${ownerCounter}-${suffix}@example.com` };
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Test Admin',
      email: `flats-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `flats-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    const inlineOwnerIds = await prisma.user
      .findMany({ where: { societyId, email: { contains: `-${suffix}@example.com` } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: inlineOwnerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds, ...inlineOwnerIds] } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  describe('POST /api/admin/flats', () => {
    it('rejects a request with no access token (401)', async () => {
      const res = await request(app)
        .post('/api/admin/flats')
        .send({ wing: 'A', flatNumber: '101', baseRate: 1500, ...ownerFields() });
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .post('/api/admin/flats')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ wing: 'A', flatNumber: '101', baseRate: 1500, ...ownerFields() });
      expect(res.status).toBe(403);
    });

    it('creates a flat given a valid admin token, provisioning the owner inline', async () => {
      const owner = ownerFields();
      const res = await request(app)
        .post('/api/admin/flats')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ wing: 'A', flatNumber: '101', baseRate: 1500, ...owner });

      expect(res.status).toBe(201);
      expect(res.body.wing).toBe('A');
      expect(res.body.flatNumber).toBe('101');
      expect(res.body.owner.email).toBe(owner.ownerEmail);
      createdFlatIds.push(res.body.id);
    });

    it('rejects invalid input with a 400', async () => {
      const res = await request(app)
        .post('/api/admin/flats')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ wing: '', flatNumber: '101', baseRate: -5, ...ownerFields() });
      expect(res.status).toBe(400);
    });

    it('rejects a duplicate wing+flatNumber within the same society (409)', async () => {
      const first = await request(app)
        .post('/api/admin/flats')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ wing: 'F', flatNumber: '901', baseRate: 1500, ...ownerFields() });
      expect(first.status).toBe(201);
      createdFlatIds.push(first.body.id);

      const second = await request(app)
        .post('/api/admin/flats')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ wing: 'F', flatNumber: '901', baseRate: 1600, ...ownerFields() });
      expect(second.status).toBe(409);
    });
  });

  describe('PATCH /api/admin/flats/:id', () => {
    async function createTestFlat(wing: string, flatNumber: string) {
      const res = await request(app)
        .post('/api/admin/flats')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ wing, flatNumber, baseRate: 1500, ...ownerFields() });
      createdFlatIds.push(res.body.id);
      return res.body.id as string;
    }

    it('rejects a request with no access token (401)', async () => {
      const flatId = await createTestFlat('G', '101');
      const res = await request(app).patch(`/api/admin/flats/${flatId}`).send({ baseRate: 1600 });
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin token (403)', async () => {
      const flatId = await createTestFlat('G', '102');
      const res = await request(app)
        .patch(`/api/admin/flats/${flatId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ baseRate: 1600 });
      expect(res.status).toBe(403);
    });

    it('updates a flat given a valid admin token', async () => {
      const flatId = await createTestFlat('G', '103');
      const res = await request(app)
        .patch(`/api/admin/flats/${flatId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ baseRate: 1650 });

      expect(res.status).toBe(200);
      expect(Number(res.body.baseRate)).toBe(1650);
    });

    it('returns 404 for a nonexistent flat', async () => {
      const res = await request(app)
        .patch('/api/admin/flats/nonexistent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ baseRate: 1600 });
      expect(res.status).toBe(404);
    });

    it('rejects invalid input with a 400', async () => {
      const flatId = await createTestFlat('G', '104');
      const res = await request(app)
        .patch(`/api/admin/flats/${flatId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ baseRate: -5 });
      expect(res.status).toBe(400);
    });

    // Regression: the admin edit form always sends tenantName/tenantEmail (as '')
    // even when occupancy is 'owner' — it doesn't omit them from the payload just
    // because they're not required in that state. A blank tenantEmail must not fail
    // .email() validation the way a genuinely-provided malformed email should.
    it('accepts a blank tenant payload when occupancy is owner (matches what the admin form sends)', async () => {
      const flatId = await createTestFlat('G', '105');
      const res = await request(app)
        .patch(`/api/admin/flats/${flatId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          baseRate: 1650,
          occupancy: 'owner',
          tenantName: '',
          tenantPhone: '',
          tenantEmail: '',
        });

      expect(res.status).toBe(200);
      expect(res.body.currentTenant).toBeNull();
    });
  });
});
