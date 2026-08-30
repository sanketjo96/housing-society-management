import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin/admin-users-service';
import { createFlat } from '../../../../src/features/flats/admin/admin-flats-onboarding-service';
import { login } from '../../../../src/features/auth/auth.service';
import { TINY_JPEG_BYTES } from '../../../fixtures/tiny-files';

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
      data: {
        name: `Ledger Route Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'ledger-route@okhdfcbank',
      },
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
    // pattern as tests/features/maintenance-records-generate.test.ts.
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
    otherOwnerToken = (await login({ email: otherOwner.email, password: otherOwnerPassword }))
      .accessToken;

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
      const res = await request(app)
        .get('/api/me/ledger')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it("returns the owner's merged ledger with totals", async () => {
      const res = await request(app)
        .get('/api/me/ledger')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totals.totalCharges).toBe(1000);
      expect(res.body.entries.some((e: { type: string }) => e.type === 'SYSTEM')).toBe(true);
    });

    it("surfaces the admin's rejection reason on a REJECTED DEPOSIT row, distinct from the resident's own note", async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '75')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(created.status).toBe(201);

      const rejected = await request(app)
        .post(`/api/admin/ledger-entries/${created.body.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Screenshot does not match the amount' });
      expect(rejected.status).toBe(200);

      const res = await request(app)
        .get('/api/me/ledger')
        .set('Authorization', `Bearer ${ownerToken}`);
      const row = res.body.entries.find((e: { id: string }) => e.id === created.body.id);
      expect(row).toBeDefined();
      expect(row.status).toBe('REJECTED');
      expect(row.adminNote).toBe('Screenshot does not match the amount');
    });
  });

  describe('payment intent endpoints', () => {
    it('GET returns null when nothing is open', async () => {
      const res = await request(app)
        .get('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.intent).toBeNull();
    });

    it('POST rejects an amount of 0 or less (400)', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('POST accepts an amount above Outstanding — no longer capped (2026-08-20 pivot)', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 999999 });
      expect(res.status).toBe(201);
      expect(res.body.intent.amount).toBe(999999);

      await request(app)
        .delete('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`);
    });

    it('POST locks an amount and returns a QR/UPI link; GET then reflects it', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 500 });
      expect(created.status).toBe(201);
      expect(created.body.intent.amount).toBe(500);
      expect(created.body.intent.qrDataUrl).toContain('data:image/png;base64,');

      const fetched = await request(app)
        .get('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(fetched.body.intent.amount).toBe(500);
    });

    it('submit without a file is rejected (400)', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits/intent/submit')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
    });

    it('submit with a file finalizes into a PENDING deposit and clears the intent', async () => {
      const submitted = await request(app)
        .post('/api/me/ledger/deposits/intent/submit')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(submitted.status).toBe(201);
      expect(submitted.body.status).toBe('PENDING');

      const fetched = await request(app)
        .get('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(fetched.body.intent).toBeNull();
    });

    it('submit stores the resident-provided optional note as the entry note', async () => {
      await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 500 });

      const submitted = await request(app)
        .post('/api/me/ledger/deposits/intent/submit')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('note', 'Paying August + September together')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(submitted.status).toBe(201);
      expect(submitted.body.note).toBe('Paying August + September together');
    });

    it('submit stores no note when none is provided', async () => {
      await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 500 });

      const submitted = await request(app)
        .post('/api/me/ledger/deposits/intent/submit')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(submitted.status).toBe(201);
      expect(submitted.body.note).toBeNull();
    });

    it('submit treats a whitespace-only note the same as no note', async () => {
      await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 500 });

      const submitted = await request(app)
        .post('/api/me/ledger/deposits/intent/submit')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('note', '   ')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(submitted.status).toBe(201);
      expect(submitted.body.note).toBeNull();
    });

    it('DELETE cancels an open intent', async () => {
      await request(app)
        .post('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 10 });

      const cancelled = await request(app)
        .delete('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(cancelled.status).toBe(204);

      const fetched = await request(app)
        .get('/api/me/ledger/deposits/intent')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(fetched.body.intent).toBeNull();
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
    });

    it('accepts an optional proof file', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '100')
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(201);
    });

    // Regression test for a Phase 9 security-audit finding (2026-08-12):
    // proof-upload.ts's fileFilter only ever checked the client-declared
    // Content-Type header, which is trivially spoofable — nothing verified the
    // actual file bytes. An attacker could declare image/jpeg while uploading
    // arbitrary content, which would later be served back to an admin reviewing
    // payment proofs with that same (attacker-controlled) Content-Type.
    it('rejects a file whose declared Content-Type does not match its actual bytes (spoofed upload)', async () => {
      const res = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '100')
        .attach('file', Buffer.from('<script>alert(1)</script>'), {
          filename: 'proof.jpg',
          contentType: 'image/jpeg',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported file type');
    });
  });

  describe('GET /api/ledger-entries/:id/file', () => {
    it('404s for an entry with no file attached', async () => {
      const created = await request(app)
        .post('/api/me/ledger/deposits')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('amount', '10');
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
        .attach('file', TINY_JPEG_BYTES, { filename: 'proof2.jpg', contentType: 'image/jpeg' });
      const res = await request(app)
        .get(`/api/ledger-entries/${uploaded.body.id}/file`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/me/balances', () => {
    it('returns lifetime maintenance/otherCharges/totalOutstanding, and availableYears', async () => {
      const res = await request(app)
        .get('/api/me/balances')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.maintenance.outstanding).toBe(1000); // the 2026-01 record from beforeAll
      expect(res.body.otherCharges.outstanding).toBe(0);
      expect(res.body.totalOutstanding).toBe(1000);
      expect(res.body.availableYears).toContain(2026);
    });

    it('scopes maintenance outstanding to the given year; lifetime and availableYears see the full set', async () => {
      const flat = await prisma.flat.findUniqueOrThrow({ where: { id: flatId } });
      await prisma.maintenanceRecord.create({
        data: {
          flatId,
          period: '2025-06',
          payerType: 'OWNER',
          amount: 500,
          dueDate: new Date('2025-06-15'),
          payerId: flat.ownerId,
        },
      });

      const res2025 = await request(app)
        .get('/api/me/balances?year=2025')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res2025.body.maintenance.outstanding).toBe(500);

      const res2026 = await request(app)
        .get('/api/me/balances?year=2026')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res2026.body.maintenance.outstanding).toBe(1000); // unaffected by the 2025 record

      const resAll = await request(app)
        .get('/api/me/balances')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resAll.body.maintenance.outstanding).toBe(1500); // lifetime sum, both years
      expect([...resAll.body.availableYears].sort()).toEqual([2025, 2026]);
    });

    it('rejects a non-numeric year (400)', async () => {
      const res = await request(app)
        .get('/api/me/balances?year=notanumber')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
    });
  });
});
