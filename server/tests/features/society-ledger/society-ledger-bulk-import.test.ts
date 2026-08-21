import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin/admin-users-service';
import { login } from '../../../src/features/auth/auth.service';
import { createFinanceCategory } from '../../../src/features/finance-categories/finance-categories.service';

describe('POST /api/admin/society-ledger/import', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  let categoryName: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Ledger Import Route Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Route Admin',
      email: `ledger-import-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const nonAdmin = await createUser({
      name: 'Non-Admin Caller',
      email: `ledger-import-route-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(nonAdmin.id);
    ownerToken = (await login({ email: nonAdmin.email, password: ownerPassword })).accessToken;

    categoryName = `Repairs ${suffix}`;
    await createFinanceCategory(societyId, admin.id, { name: categoryName, direction: 'EXPENSE' });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.societyLedgerEntry.deleteMany({ where: { societyId } });
    await prisma.societyLedgerCategory.deleteMany({ where: { societyId } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/import')
      .send({ csv: `direction,categoryname,amount,transactiondate,paymentmethod\nEXPENSE,${categoryName},100,2024-01-01,CASH` });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/import')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ csv: `direction,categoryname,amount,transactiondate,paymentmethod\nEXPENSE,${categoryName},100,2024-01-01,CASH` });
    expect(res.status).toBe(403);
  });

  it('imports a valid row given a valid admin token, with no file required (200)', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        csv: `direction,categoryname,amount,transactiondate,paymentmethod\nEXPENSE,${categoryName},4200,2024-01-05,CASH`,
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(0);
  });

  it('rejects an empty csv field with a 400', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csv: '' });
    expect(res.status).toBe(400);
  });
});
