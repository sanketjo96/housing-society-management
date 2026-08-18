import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { login } from '../../../../src/features/auth/auth.service';

describe('POST /api/admin/flats/import', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
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
      email: `import-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `import-caller-${suffix}@example.com`,
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
    // Imported rows provision their own owner accounts inline — sweep by society
    // rather than tracking each one.
    const allUserIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app)
      .post('/api/admin/flats/import')
      .send({
        csv: `wing,flatNumber,ownerName,ownerPhone,ownerEmail\nI,101,Import Owner,9000000101,import-owner-101-${suffix}@example.com`,
      });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .post('/api/admin/flats/import')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        csv: `wing,flatNumber,ownerName,ownerPhone,ownerEmail\nI,101,Import Owner,9000000101,import-owner-101-${suffix}@example.com`,
      });
    expect(res.status).toBe(403);
  });

  it('imports valid rows and reports per-row errors, given a valid admin token', async () => {
    const csv =
      'wing,flatNumber,ownerName,ownerPhone,ownerEmail\n' +
      `I,201,Import Owner,9000000201,import-owner-201-${suffix}@example.com\n` +
      'I,202,,,';
    const res = await request(app)
      .post('/api/admin/flats/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(1);
    createdFlatIds.push(res.body.created[0].id);
    expect(res.body.errors).toHaveLength(1);
  });

  it('rejects an empty csv field with a 400', async () => {
    const res = await request(app)
      .post('/api/admin/flats/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv: '' });
    expect(res.status).toBe(400);
  });
});
