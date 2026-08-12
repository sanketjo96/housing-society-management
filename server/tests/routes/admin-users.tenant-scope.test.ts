import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

describe('GET /api/admin/users/:id — tenant scoping', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyAId: string;
  let societyBId: string;
  let adminAToken: string;
  const createdUserIds: string[] = [];
  let userInSocietyAId: string;
  let userInSocietyBId: string;

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
      email: `admin-a-${suffix}@example.com`,
      password: adminAPassword,
      role: 'ADMIN',
      societyId: societyAId,
    });
    createdUserIds.push(adminA.id);
    adminAToken = (await login({ email: adminA.email, password: adminAPassword })).accessToken;

    const userInA = await createUser({
      name: 'Resident of Society A',
      email: `resident-a-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId: societyAId,
    });
    createdUserIds.push(userInA.id);
    userInSocietyAId = userInA.id;

    const userInB = await createUser({
      name: 'Resident of Society B',
      email: `resident-b-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId: societyBId,
    });
    createdUserIds.push(userInB.id);
    userInSocietyBId = userInB.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyAId, societyBId] } } });
    await prisma.$disconnect();
  });

  it('an admin from Society A can fetch a user in their own society (same-society success)', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${userInSocietyAId}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userInSocietyAId);
  });

  it('an admin from Society A gets nothing for a user in Society B (cross-society leak)', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${userInSocietyBId}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(res.status).toBe(404);
  });

  // Regression test for a Phase 9 security-audit finding (2026-08-12):
  // createUserHandler used to read `societyId` straight from the request body and
  // pass it through unchecked, letting any authenticated ADMIN provision a
  // full-privilege account (including role: 'ADMIN') inside an arbitrary *other*
  // society just by naming its id — a full write-side tenant-boundary bypass, not
  // just a read leak.
  it('ignores a client-supplied societyId when creating a user — the new user always lands in the caller\'s own society', async () => {
    const email = `injected-${suffix}@example.com`;
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        name: 'Attempted Cross-Society Admin',
        email,
        password: 'password-123',
        role: 'ADMIN',
        societyId: societyBId, // Society A's admin tries to plant an account in Society B.
      });

    expect(res.status).toBe(201);
    expect(res.body.societyId).toBe(societyAId);
    expect(res.body.societyId).not.toBe(societyBId);
    createdUserIds.push(res.body.id);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.societyId).toBe(societyAId);
  });
});
