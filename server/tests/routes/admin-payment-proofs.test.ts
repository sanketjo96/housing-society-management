import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';

describe('/api/admin/payment-proofs, /api/admin/maintenance-records/mark-paid', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  async function makeRecord(period: string) {
    const record = await prisma.maintenanceRecord.create({
      data: { flatId, period, payerType: 'OWNER', amount: 900, dueDate: new Date('2026-12-01'), payerId: ownerId },
    });
    return record.id;
  }

  async function uploadProofFor(recordId: string) {
    const res = await request(app)
      .post('/api/me/payment-proofs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('maintenanceRecordIds', JSON.stringify([recordId]))
      .attach('file', Buffer.from('proof-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });
    return res.body.id as string;
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Admin Proof Society ${suffix}`, address: '1 Test St', upiVpa: 'admin-proof@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Admin Proof Admin',
      email: `admin-proof-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Admin Proof Owner',
      email: `admin-proof-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    ownerId = owner.id;
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;

    const flat = await prisma.flat.create({
      data: { wing: 'M', flatNumber: '101', baseRate: 900, societyId, ownerId },
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

  describe('GET /api/admin/payment-proofs', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app).get('/api/admin/payment-proofs').set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(403);
    });

    it('lists pending proofs for the admin', async () => {
      const recordId = await makeRecord('2026-01');
      const proofId = await uploadProofFor(recordId);

      const res = await request(app)
        .get('/api/admin/payment-proofs?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.some((p: { id: string }) => p.id === proofId)).toBe(true);
      const listed = res.body.find((p: { id: string }) => p.id === proofId);
      expect(listed.uploadedBy.id).toBe(ownerId);
      expect(listed.maintenanceRecords[0].flat.id).toBe(flatId);
    });
  });

  describe('POST /api/admin/payment-proofs/:id/approve', () => {
    it('approves a pending proof and marks its records PAID', async () => {
      const recordId = await makeRecord('2026-02');
      const proofId = await uploadProofFor(recordId);

      const res = await request(app)
        .post(`/api/admin/payment-proofs/${proofId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');

      const record = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id: recordId } });
      expect(record.status).toBe('PAID');
    });

    it('returns 409 on a second approve of the same proof', async () => {
      const recordId = await makeRecord('2026-03');
      const proofId = await uploadProofFor(recordId);
      await request(app).post(`/api/admin/payment-proofs/${proofId}/approve`).set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app)
        .post(`/api/admin/payment-proofs/${proofId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('returns 404 for a made-up proof id', async () => {
      const res = await request(app)
        .post('/api/admin/payment-proofs/does-not-exist/approve')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/payment-proofs/:id/reject', () => {
    it('rejects a pending proof, reverts its records to UNPAID, and stores the reason', async () => {
      const recordId = await makeRecord('2026-04');
      const proofId = await uploadProofFor(recordId);

      const res = await request(app)
        .post(`/api/admin/payment-proofs/${proofId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Amount does not match' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.adminNote).toBe('Amount does not match');

      const record = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id: recordId } });
      expect(record.status).toBe('UNPAID');
    });
  });

  describe('POST /api/admin/maintenance-records/mark-paid', () => {
    it('rejects a non-admin token (403)', async () => {
      const res = await request(app)
        .post('/api/admin/maintenance-records/mark-paid')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ maintenanceRecordIds: ['x'] });
      expect(res.status).toBe(403);
    });

    it('marks the given records PAID, logged distinctly from proof approvals', async () => {
      const recordId = await makeRecord('2026-05');

      const res = await request(app)
        .post('/api/admin/maintenance-records/mark-paid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maintenanceRecordIds: [recordId] });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1);

      const record = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id: recordId } });
      expect(record.status).toBe('PAID');

      const log = await prisma.auditLog.findFirst({ where: { entityId: recordId, action: 'MANUAL_MARK_PAID' } });
      expect(log).not.toBeNull();
    });

    it('rejects if a given record is not currently UNPAID (409)', async () => {
      const recordId = await makeRecord('2026-06');
      await request(app)
        .post('/api/admin/maintenance-records/mark-paid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maintenanceRecordIds: [recordId] });

      const res = await request(app)
        .post('/api/admin/maintenance-records/mark-paid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maintenanceRecordIds: [recordId] });
      expect(res.status).toBe(409);
    });
  });
});
