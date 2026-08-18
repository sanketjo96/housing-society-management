import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { login } from '../../../../src/features/auth/auth.service';

describe('PATCH /api/me', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerToken: string;
  let tenantToken: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Owner Original',
      email: `me-route-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
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
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app).patch('/api/me').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('updates the caller’s own profile given a valid token, any role', async () => {
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ name: 'Tenant Updated', phone: '+919000000099' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tenant Updated');
  });

  it('rejects invalid input with a 400', async () => {
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
