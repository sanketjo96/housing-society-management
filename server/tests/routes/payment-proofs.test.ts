import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

describe('/api/me/maintenance-records/qr, /api/me/payment-proofs, /api/payment-proofs/:id/file', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let adminToken: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  async function makeRecord(period: string, payerId: string) {
    const record = await prisma.maintenanceRecord.create({
      data: { flatId, period, payerType: 'OWNER', amount: 1200, dueDate: new Date('2026-12-01'), payerId },
    });
    return record.id;
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Proof Route Society ${suffix}`, address: '1 Test St', upiVpa: 'proof-route@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Proof Route Admin',
      email: `proof-route-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Proof Route Owner',
      email: `proof-route-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const otherOwnerPassword = 'owner2-password-123';
    const otherOwner = await createUser({
      name: 'Other Proof Route Owner',
      email: `other-proof-route-owner-${suffix}@example.com`,
      password: otherOwnerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(otherOwner.id);
    otherOwnerToken = (await login({ email: otherOwner.email, password: otherOwnerPassword })).accessToken;

    const flat = await prisma.flat.create({
      data: { wing: 'R', flatNumber: '101', baseRate: 1200, societyId, ownerId: owner.id },
    });
    flatId = flat.id;
    createdFlatIds.push(flatId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.paymentProof.deleteMany({ where: { uploadedById: { in: createdUserIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  describe('POST /api/me/maintenance-records/qr', () => {
    it('rejects with no token (401)', async () => {
      const res = await request(app).post('/api/me/maintenance-records/qr').send({ maintenanceRecordIds: ['x'] });
      expect(res.status).toBe(401);
    });

    it('rejects an ADMIN token (403) — QR generation is a resident action', async () => {
      const res = await request(app)
        .post('/api/me/maintenance-records/qr')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maintenanceRecordIds: ['x'] });
      expect(res.status).toBe(403);
    });

    it('returns a QR + UPI link for a valid selection of own unpaid records', async () => {
      const id = await makeRecord('2026-01', (await prisma.flat.findUniqueOrThrow({ where: { id: flatId } })).ownerId);
      const res = await request(app)
        .post('/api/me/maintenance-records/qr')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ maintenanceRecordIds: [id] });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(1200);
      expect(res.body.upiLink).toContain('upi://pay?');
      expect(res.body.qrDataUrl).toContain('data:image/png;base64,');
    });
  });

  describe('POST /api/me/payment-proofs', () => {
    it('rejects with no token (401)', async () => {
      const res = await request(app).post('/api/me/payment-proofs');
      expect(res.status).toBe(401);
    });

    it('rejects a request with no file (400)', async () => {
      const owner = await prisma.flat.findUniqueOrThrow({ where: { id: flatId } });
      const id = await makeRecord('2026-02', owner.ownerId);
      const res = await request(app)
        .post('/api/me/payment-proofs')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('maintenanceRecordIds', JSON.stringify([id]));
      expect(res.status).toBe(400);
    });

    it('rejects an unsupported file type (400)', async () => {
      const owner = await prisma.flat.findUniqueOrThrow({ where: { id: flatId } });
      const id = await makeRecord('2026-03', owner.ownerId);
      const res = await request(app)
        .post('/api/me/payment-proofs')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('maintenanceRecordIds', JSON.stringify([id]))
        .attach('file', Buffer.from('not a real proof'), { filename: 'proof.txt', contentType: 'text/plain' });
      expect(res.status).toBe(400);
    });

    it('accepts a valid image and creates a PENDING proof', async () => {
      const owner = await prisma.flat.findUniqueOrThrow({ where: { id: flatId } });
      const id = await makeRecord('2026-04', owner.ownerId);
      const res = await request(app)
        .post('/api/me/payment-proofs')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('maintenanceRecordIds', JSON.stringify([id]))
        .attach('file', Buffer.from('fake-jpeg-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');

      const record = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id } });
      expect(record.status).toBe('PENDING_REVIEW');
    });
  });

  describe('GET /api/payment-proofs/:id/file', () => {
    async function createProof() {
      const owner = await prisma.flat.findUniqueOrThrow({ where: { id: flatId } });
      const id = await makeRecord(`2026-0${Math.floor(Math.random() * 9) + 1}-${Date.now()}`, owner.ownerId);
      const uploadRes = await request(app)
        .post('/api/me/payment-proofs')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('maintenanceRecordIds', JSON.stringify([id]))
        .attach('file', Buffer.from('proof-file-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });
      return uploadRes.body.id as string;
    }

    it('rejects with no token (401)', async () => {
      const res = await request(app).get('/api/payment-proofs/does-not-exist/file');
      expect(res.status).toBe(401);
    });

    it('returns 404 for a made-up id', async () => {
      const res = await request(app)
        .get('/api/payment-proofs/does-not-exist/file')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
    });

    it('lets the uploading resident view their own proof', async () => {
      const proofId = await createProof();
      const res = await request(app).get(`/api/payment-proofs/${proofId}/file`).set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
    });

    it('lets an admin view any proof in the society', async () => {
      const proofId = await createProof();
      const res = await request(app).get(`/api/payment-proofs/${proofId}/file`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('forbids a different resident from viewing (403)', async () => {
      const proofId = await createProof();
      const res = await request(app)
        .get(`/api/payment-proofs/${proofId}/file`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(res.status).toBe(403);
    });
  });
});
