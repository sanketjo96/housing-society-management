import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { createFlat } from '../../src/services/flats.service';
import { login } from '../../src/services/auth.service';

describe('/api/me/ledger*, /api/ledger-entries/:id/file', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerToken: string;
  let adminToken: string;
  let otherOwnerToken: string;
  const createdFlatIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Ledger Route Society ${suffix}`, address: '1 Test St', upiVpa: 'ledger-route@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Ledger Route Admin',
      email: `ledger-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const ownerUser = await createUser({
      name: 'Ledger Route Owner',
      email: `ledger-route-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(ownerUser.id);
    ownerToken = (await login({ email: ownerUser.email, password: ownerPassword })).accessToken;

    // createFlat finds the already-existing OWNER by email (matching role) and reuses
    // it in place, rather than creating a second random-password account — same
    // pattern as tests/routes/maintenance-records-generate.test.ts.
    const flat = await createFlat({
      societyId,
      wing: 'L',
      flatNumber: '201',
      baseRate: 1000,
      ownerName: 'Ledger Route Owner',
      ownerEmail: ownerUser.email,
    });
    flatId = flat!.id;
    createdFlatIds.push(flatId);

    const otherOwnerPassword = 'other-owner-password-123';
    const otherOwner = await createUser({
      name: 'Other Owner',
      email: `ledger-route-other-owner-${suffix}@example.com`,
      password: otherOwnerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(otherOwner.id);
    otherOwnerToken = (await login({ email: otherOwner.email, password: otherOwnerPassword })).accessToken;

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

  describe('GET /api/me/ledger', () => {
    it('rejects with no token (401)', async () => {
      const res = await request(app).get('/api/me/ledger');
      expect(res.status).toBe(401);
    });

    it('rejects an ADMIN token (403)', async () => {
      const res = await request(app).get('/api/me/ledger').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it("returns the owner's merged ledger with totals", async () => {
      const res = await request(app).get('/api/me/ledger').set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totals.totalCharges).toBe(1000);
      expect(res.body.entries.some((e: { type: string }) => e.type === 'SYSTEM')).toBe(true);
    });
  });

  describe('POST /api/me/ledger/deposits/qr', () => {
    it('returns a QR for a valid amount within payable', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits/qr')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 500 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(500);
      expect(res.body.qrDataUrl).toContain('data:image/png;base64,');
    });

    it('rejects an amount above payable (400)', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits/qr')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 999999 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/me/ledger/deposits', () => {
    it('creates a PENDING deposit with no file attached', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '250');
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.type).toBe('DEPOSIT');
    });

    it('accepts an optional proof file', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '100')
        .attach('file', Buffer.from('fake-jpeg-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/me/ledger/credits', () => {
    it('requires a note', async () => {
      const res = await request(app)
        .post('/api/me/ledger/credits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50');
      expect(res.status).toBe(400);
    });

    it('creates a PENDING credit', async () => {
      const res = await request(app)
        .post('/api/me/ledger/credits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .field('note', 'Paid plumber');
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.type).toBe('CREDIT');
    });
  });

  describe('GET /api/ledger-entries/:id/file', () => {
    it('404s for an entry with no file attached', async () => {
      const created = await request(app)
        .post('/api/me/ledger/credits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '10')
        .field('note', 'no file');
      const res = await request(app)
        .get(`/api/ledger-entries/${created.body.id}/file`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
    });

    it('forbids a different resident from viewing (403)', async () => {
      const uploaded = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '20')
        .attach('file', Buffer.from('fake-jpeg-bytes'), { filename: 'proof2.jpg', contentType: 'image/jpeg' });
      const res = await request(app)
        .get(`/api/ledger-entries/${uploaded.body.id}/file`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(res.status).toBe(403);
    });
  });
});
