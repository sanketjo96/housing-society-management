import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { createFlat } from '../../../../src/features/flats/admin/admin-flats-onboarding-service';
import { login } from '../../../../src/features/auth/auth.service';
import { manualDeposit } from '../../../../src/features/ledger/admin/admin-ledger-service';
import { TINY_JPEG_BYTES } from '../../../fixtures/tiny-files';

describe('/api/admin/ledger-entries*', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdFlatIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Admin Ledger Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'admin-ledger@okhdfcbank',
      },
    });
    societyId = society.id;

    // approve/manual-deposit both issue a receipt, blocked unless at least one
    // committee signature is configured (SignaturesNotConfiguredError) — see the
    // dedicated 409 tests below for the unconfigured case.
    await prisma.society.update({
      where: { id: societyId },
      data: { chairmanSignatureFileKey: 'fake-chairman-signature-key.png' },
    });

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Admin Ledger Admin',
      email: `admin-ledger-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Admin Ledger Owner',
      email: `admin-ledger-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const flat = await createFlat({
      societyId,
      wing: 'M',
      flatNumber: '301',
      baseRate: 1000,
      ownerName: 'Admin Ledger Owner',
      ownerEmail: owner.email,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    createdFlatIds.push(flatId);

    await prisma.maintenanceRecord.create({
      data: {
        flatId,
        period: '2026-01',
        payerType: 'OWNER',
        amount: 1000,
        dueDate: new Date('2026-01-15'),
        payerId: ownerId,
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

  describe('GET /api/admin/ledger-entries', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .get('/api/admin/ledger-entries')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('lists pending entries for the admin', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '100')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(created.status).toBe(201);

      const res = await request(app)
        .get('/api/admin/ledger-entries?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((e: { id: string }) => e.id === created.body.id)).toBe(true);
    });

    // Mark as Paid page (delinked from Payment Proofs, 2026-08-20) — filters to
    // exactly the entries an admin recorded directly (manualDeposit), excluding a
    // resident's own Deposit even though both are DEPOSIT/APPROVED rows.
    it('filters to createdByType=ADMIN, excluding a resident-submitted deposit', async () => {
      const residentDeposit = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '100')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(residentDeposit.status).toBe(201);

      const manualDeposit = await request(app)
        .post('/api/admin/ledger-entries/manual-deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ flatId, amount: 300 });
      expect(manualDeposit.status).toBe(201);

      const res = await request(app)
        .get('/api/admin/ledger-entries?createdByType=ADMIN')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((e: { id: string }) => e.id);
      expect(ids).toContain(manualDeposit.body.id);
      expect(ids).not.toContain(residentDeposit.body.id);
    });
  });

  describe('POST /api/admin/ledger-entries/:id/approve', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .post('/api/admin/ledger-entries/does-not-exist/approve')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('approves a pending entry', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: 'UTR123456789' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.bankReference).toBe('UTR123456789');
    });

    it('returns 400 and never approves when bankReference is missing', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);

      const entry = await prisma.ledgerEntry.findUnique({ where: { id: created.body.id } });
      expect(entry!.status).toBe('PENDING');
    });

    it('returns 400 when bankReference is whitespace-only', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: '   ' });
      expect(res.status).toBe(400);
    });

    it('returns 409 and never approves when the society has no signatures configured', async () => {
      const unsignedSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const unsignedSociety = await prisma.society.create({
        data: {
          name: `Unsigned Admin Ledger Society ${unsignedSuffix}`,
          address: '2 Test St',
          upiVpa: `unsigned-admin-ledger-${unsignedSuffix}@okhdfcbank`,
        },
      });
      const unsignedAdmin = await createUser({
        name: 'Unsigned Admin',
        email: `unsigned-admin-${unsignedSuffix}@example.com`,
        password: 'admin-password-123',
        role: 'ADMIN',
        societyId: unsignedSociety.id,
      });
      const unsignedAdminToken = (
        await login({ email: unsignedAdmin.email, password: 'admin-password-123' })
      ).accessToken;
      const unsignedOwnerPassword = 'owner-password-123';
      const unsignedOwner = await createUser({
        name: 'Unsigned Owner',
        email: `unsigned-owner-${unsignedSuffix}@example.com`,
        password: unsignedOwnerPassword,
        role: 'OWNER',
        societyId: unsignedSociety.id,
      });
      const unsignedOwnerToken = (
        await login({ email: unsignedOwner.email, password: unsignedOwnerPassword })
      ).accessToken;
      const unsignedFlat = await createFlat({
        societyId: unsignedSociety.id,
        wing: 'U',
        flatNumber: '1',
        baseRate: 1000,
        ownerName: 'Unsigned Owner',
        ownerEmail: unsignedOwner.email,
      });

      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${unsignedOwnerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(created.status).toBe(201);

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${unsignedAdminToken}`)
        .send({ bankReference: 'UTR-UNSIGNED-1' });
      expect(res.status).toBe(409);

      const entry = await prisma.ledgerEntry.findUnique({ where: { id: created.body.id } });
      expect(entry!.status).toBe('PENDING');

      await prisma.ledgerEntry.deleteMany({ where: { flatId: unsignedFlat!.id } });
      await prisma.maintenanceRecord.deleteMany({ where: { flatId: unsignedFlat!.id } });
      await prisma.flat.deleteMany({ where: { id: unsignedFlat!.id } });
      const unsignedUserIds = [unsignedAdmin.id, unsignedOwner.id];
      await prisma.refreshToken.deleteMany({ where: { userId: { in: unsignedUserIds } } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: unsignedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: unsignedUserIds } } });
      await prisma.society.delete({ where: { id: unsignedSociety.id } });
    });

    it('returns 409 on a second approve of the same entry', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: 'UTR-SECOND-1' });

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: 'UTR-SECOND-2' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/admin/ledger-entries/:id/infer-bank-reference', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .post('/api/admin/ledger-entries/does-not-exist/infer-bank-reference')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('404s for an unknown entry', async () => {
      const res = await request(app)
        .post('/api/admin/ledger-entries/does-not-exist/infer-bank-reference')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('returns bankReference: null, not an error, for an entry with no proof file', async () => {
      const manual = await manualDeposit(societyId, ownerId, flatId, 25);

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${manual!.id}/infer-bank-reference`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ bankReference: null });
    });

    it('returns bankReference: null, not an error, when the proof image has no readable text', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/infer-bank-reference`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ bankReference: null });
    }, 20000);
  });

  describe('GET /api/admin/ledger-entries/:id/receipt-preview', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .get('/api/admin/ledger-entries/does-not-exist/receipt-preview')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('404s for an unknown entry', async () => {
      const res = await request(app)
        .get('/api/admin/ledger-entries/does-not-exist/receipt-preview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('streams a PDF preview for a pending entry, with no side effects', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '60')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .get(`/api/admin/ledger-entries/${created.body.id}/receipt-preview`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(Buffer.from(res.body).subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const receiptCount = await prisma.receipt.count({
        where: { ledgerEntryId: created.body.id },
      });
      expect(receiptCount).toBe(0);
    });

    it('returns 409 once the entry has already been approved', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '60')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: 'UTR-PREVIEW-1' });

      const res = await request(app)
        .get(`/api/admin/ledger-entries/${created.body.id}/receipt-preview`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/ledger-entries/:id/receipt (issued receipt download)', () => {
    it('404s while the entry is still pending', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '60')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .get(`/api/ledger-entries/${created.body.id}/receipt`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
    });

    it('lets the owner (payer) download their own issued receipt', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '60')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: 'UTR-DL-OWNER-1' });

      const res = await request(app)
        .get(`/api/ledger-entries/${created.body.id}/receipt`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('lets an admin download the same receipt', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '60')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bankReference: 'UTR-DL-ADMIN-1' });

      const res = await request(app)
        .get(`/api/ledger-entries/${created.body.id}/receipt`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/ledger-entries/:id/reject', () => {
    it('rejects a pending entry and stores the reason', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '50')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });

      const res = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'not a valid bill' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.adminNote).toBe('not a valid bill');
    });
  });

  describe('POST /api/admin/ledger-entries/manual-deposit', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .post('/api/admin/ledger-entries/manual-deposit')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ flatId, amount: 100 });
      expect(res.status).toBe(403);
    });

    it('creates an already-approved deposit for cash/bank-transfer, logged distinctly', async () => {
      const res = await request(app)
        .post('/api/admin/ledger-entries/manual-deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ flatId, amount: 250 });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPROVED');

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: res.body.id, action: 'MANUAL_MARK_PAID' },
      });
      expect(auditRow).not.toBeNull();
    });

    it('404s for a flat outside the admin society', async () => {
      const res = await request(app)
        .post('/api/admin/ledger-entries/manual-deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ flatId: 'does-not-exist', amount: 100 });
      expect(res.status).toBe(404);
    });

    it('returns 409 and creates nothing when the society has no signatures configured', async () => {
      const unsignedSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const unsignedSociety = await prisma.society.create({
        data: {
          name: `Unsigned Manual Deposit Society ${unsignedSuffix}`,
          address: '3 Test St',
        },
      });
      const unsignedAdmin = await createUser({
        name: 'Unsigned Manual Deposit Admin',
        email: `unsigned-manual-admin-${unsignedSuffix}@example.com`,
        password: 'admin-password-123',
        role: 'ADMIN',
        societyId: unsignedSociety.id,
      });
      const unsignedAdminToken = (
        await login({ email: unsignedAdmin.email, password: 'admin-password-123' })
      ).accessToken;
      const unsignedFlat = await createFlat({
        societyId: unsignedSociety.id,
        wing: 'U',
        flatNumber: '2',
        baseRate: 1000,
        ownerName: 'Unsigned Manual Deposit Owner',
        ownerEmail: `unsigned-manual-owner-${unsignedSuffix}@example.com`,
      });

      const res = await request(app)
        .post('/api/admin/ledger-entries/manual-deposit')
        .set('Authorization', `Bearer ${unsignedAdminToken}`)
        .send({ flatId: unsignedFlat!.id, amount: 100 });
      expect(res.status).toBe(409);

      const entryCount = await prisma.ledgerEntry.count({ where: { flatId: unsignedFlat!.id } });
      expect(entryCount).toBe(0);

      await prisma.maintenanceRecord.deleteMany({ where: { flatId: unsignedFlat!.id } });
      await prisma.flat.deleteMany({ where: { id: unsignedFlat!.id } });
      const unsignedUserIds = await prisma.user
        .findMany({ where: { societyId: unsignedSociety.id }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));
      await prisma.refreshToken.deleteMany({ where: { userId: { in: unsignedUserIds } } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: unsignedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: unsignedUserIds } } });
      await prisma.society.delete({ where: { id: unsignedSociety.id } });
    });
  });
});
