import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

describe('PATCH /api/admin/flats/:id — tenant scoping', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyAId: string;
  let societyBId: string;
  let adminAToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];
  let flatInSocietyBId: string;

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
      email: `flats-admin-a-${suffix}@example.com`,
      password: adminAPassword,
      role: 'ADMIN',
      societyId: societyAId,
    });
    createdUserIds.push(adminA.id);
    adminAToken = (await login({ email: adminA.email, password: adminAPassword })).accessToken;

    const ownerB = await createUser({
      name: 'Owner of Society B',
      email: `flats-owner-b-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId: societyBId,
    });
    createdUserIds.push(ownerB.id);

    const flatB = await prisma.flat.create({
      data: { block: 'X', flatNumber: '1', baseRate: 1000, societyId: societyBId, ownerId: ownerB.id },
    });
    createdFlatIds.push(flatB.id);
    flatInSocietyBId = flatB.id;
  });

  afterAll(async () => {
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyAId, societyBId] } } });
    await prisma.$disconnect();
  });

  it('an admin from Society A gets 404 patching a flat that belongs to Society B (cross-society leak)', async () => {
    const res = await request(app)
      .patch(`/api/admin/flats/${flatInSocietyBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ baseRate: 9999 });
    expect(res.status).toBe(404);

    const stored = await prisma.flat.findUniqueOrThrow({ where: { id: flatInSocietyBId } });
    expect(Number(stored.baseRate)).toBe(1000);
  });
});
