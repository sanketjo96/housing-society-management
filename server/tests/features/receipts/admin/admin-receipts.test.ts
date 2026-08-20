import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { createFlat } from '../../../../src/features/flats/admin/admin-flats-onboarding-service';
import { login } from '../../../../src/features/auth/auth.service';
import { TINY_JPEG_BYTES } from '../../../fixtures/tiny-files';

describe('GET /api/admin/receipts', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let adminToken: string;
  let ownerToken: string;
  let ownerEmail: string;
  const createdFlatIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Admin Receipts Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'admin-receipts@okhdfcbank',
      },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Admin Receipts Admin',
      email: `admin-receipts-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Admin Receipts Owner',
      email: `admin-receipts-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;
    ownerEmail = owner.email;

    const flat = await createFlat({
      societyId,
      wing: 'R',
      flatNumber: '201',
      baseRate: 1000,
      ownerName: 'Admin Receipts Owner',
      ownerEmail: owner.email,
    });
    flatId = flat!.id;
    createdFlatIds.push(flatId);

    await prisma.maintenanceRecord.create({
      data: {
        flatId,
        period: '2026-01',
        payerType: 'OWNER',
        amount: 1000,
        dueDate: new Date('2026-01-15'),
        payerId: flat!.ownerId,
      },
    });
  });

  afterAll(async () => {
    await prisma.receipt.deleteMany({ where: { societyId } });
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    const allUserIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .get('/api/admin/receipts')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns an empty list when nothing has been approved yet', async () => {
    const res = await request(app)
      .get('/api/admin/receipts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists an issued receipt after a deposit is approved, newest first', async () => {
    const created = await request(app)
      .post('/api/me/ledger/deposits')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('amount', '100')
      .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
    expect(created.status).toBe(201);

    const approved = await request(app)
      .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approved.status).toBe(200);

    const res = await request(app)
      .get('/api/admin/receipts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const [receipt] = res.body;
    expect(receipt.receiptNumber).toMatch(/^RCPT-R201-/);
    expect(receipt.ledgerEntry.id).toBe(created.body.id);
    expect(receipt.ledgerEntry.type).toBe('DEPOSIT');
    expect(receipt.ledgerEntry.category).toBe('MAINTENANCE');
    expect(receipt.ledgerEntry.amount).toBe('100');
    expect(receipt.ledgerEntry.flat.wing).toBe('R');
    expect(receipt.ledgerEntry.flat.flatNumber).toBe('201');
    expect(receipt.ledgerEntry.payer.email).toBe(ownerEmail);
  });

  it('does not include a manually recorded deposit for a different society', async () => {
    const otherSociety = await prisma.society.create({
      data: {
        name: `Admin Receipts Other Society ${suffix}`,
        address: '2 Test St',
        upiVpa: 'admin-receipts-other@okhdfcbank',
      },
    });
    const otherAdminPassword = 'other-admin-password-123';
    const otherAdmin = await createUser({
      name: 'Other Society Admin',
      email: `admin-receipts-other-admin-${suffix}@example.com`,
      password: otherAdminPassword,
      role: 'ADMIN',
      societyId: otherSociety.id,
    });
    const otherOwner = await createUser({
      name: 'Other Society Owner',
      email: `admin-receipts-other-owner-${suffix}@example.com`,
      password: 'other-owner-password-123',
      role: 'OWNER',
      societyId: otherSociety.id,
    });
    const otherFlat = await createFlat({
      societyId: otherSociety.id,
      wing: 'X',
      flatNumber: '1',
      baseRate: 1000,
      ownerName: 'Other Society Owner',
      ownerEmail: otherOwner.email,
    });
    const otherAdminToken = (
      await login({ email: otherAdmin.email, password: otherAdminPassword })
    ).accessToken;

    const manual = await request(app)
      .post('/api/admin/ledger-entries/manual-deposit')
      .set('Authorization', `Bearer ${otherAdminToken}`)
      .send({ flatId: otherFlat!.id, amount: 200 });
    expect(manual.status).toBe(201);

    const res = await request(app)
      .get('/api/admin/receipts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { ledgerEntry: { id: string } }) => r.ledgerEntry.id === manual.body.id)).toBe(
      false,
    );

    await prisma.receipt.deleteMany({ where: { societyId: otherSociety.id } });
    await prisma.ledgerEntry.deleteMany({ where: { flatId: otherFlat!.id } });
    await prisma.flat.delete({ where: { id: otherFlat!.id } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [otherAdmin.id, otherOwner.id] } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: [otherAdmin.id, otherOwner.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [otherAdmin.id, otherOwner.id] } } });
    await prisma.society.delete({ where: { id: otherSociety.id } });
  });
});
