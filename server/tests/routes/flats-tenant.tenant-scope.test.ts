import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

describe('POST/DELETE /api/admin/flats/:id/tenant — tenant scoping', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyAId: string;
  let societyBId: string;
  let adminAToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];
  let flatInSocietyBId: string;
  let tenantInSocietyBId: string;

  beforeAll(async () => {
    const societyA = await prisma.society.create({
      data: { name: `Society A ${suffix}`, address: 'A St', upiVpa: 'a@okhdfcbank' },
    });
    societyAId = societyA.id;

    const societyB = await prisma.society.create({
      data: { name: `Society B ${suffix}`, address: 'B St', upiVpa: 'b@okhdfcbank' },
    });
    societyBId = societyB.id;

    const adminAPassword = 'admin-a-password-123';
    const adminA = await createUser({
      name: 'Admin of Society A',
      email: `tenant-scope-admin-a-${suffix}@example.com`,
      password: adminAPassword,
      role: 'ADMIN',
      societyId: societyAId,
    });
    createdUserIds.push(adminA.id);
    adminAToken = (await login({ email: adminA.email, password: adminAPassword })).accessToken;

    const ownerB = await createUser({
      name: 'Owner of Society B',
      email: `tenant-scope-owner-b-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId: societyBId,
    });
    createdUserIds.push(ownerB.id);

    const tenantB = await createUser({
      name: 'Tenant of Society B',
      email: `tenant-scope-tenant-b-${suffix}@example.com`,
      password: 'password-123',
      role: 'TENANT',
      societyId: societyBId,
    });
    createdUserIds.push(tenantB.id);
    tenantInSocietyBId = tenantB.id;

    const flatB = await prisma.flat.create({
      data: { block: 'X', flatNumber: '1', baseRate: 1000, societyId: societyBId, ownerId: ownerB.id },
    });
    createdFlatIds.push(flatB.id);
    flatInSocietyBId = flatB.id;
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyAId, societyBId] } } });
    await prisma.$disconnect();
  });

  it('an admin from Society A gets 404 assigning a tenant to a flat that belongs to Society B', async () => {
    const res = await request(app)
      .post(`/api/admin/flats/${flatInSocietyBId}/tenant`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ tenantId: tenantInSocietyBId });
    expect(res.status).toBe(404);

    const occupancy = await prisma.occupancyChange.findFirst({ where: { flatId: flatInSocietyBId } });
    expect(occupancy).toBeNull();
  });

  it('an admin from Society A gets 404 removing the tenant from a flat that belongs to Society B', async () => {
    const res = await request(app)
      .delete(`/api/admin/flats/${flatInSocietyBId}/tenant`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(res.status).toBe(404);
  });
});
