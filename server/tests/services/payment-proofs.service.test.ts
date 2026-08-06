import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import {
  approveProof,
  ForbiddenProofAccessError,
  generatePaymentQr,
  getProofForViewing,
  listPaymentProofs,
  markRecordsPaid,
  ProofAlreadyReviewedError,
  RecordsNotEligibleError,
  RecordsNotFoundError,
  rejectProof,
  uploadPaymentProof,
} from '../../src/services/payment-proofs.service';

describe('payment-proofs service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let adminId: string;
  let flatId: string;
  const createdFlatIds: string[] = [];
  const createdUserIds: string[] = [];

  async function makeRecord(period: string, status: 'UNPAID' | 'PENDING_REVIEW' | 'PAID' = 'UNPAID') {
    return prisma.maintenanceRecord.create({
      data: {
        flatId,
        period,
        payerType: 'OWNER',
        amount: 1000,
        status,
        dueDate: new Date('2026-12-01'),
        payerId: ownerId,
      },
    });
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Proofs Test Society ${suffix}`, address: '1 Test St', upiVpa: 'proofs-test@okhdfcbank' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Proofs Society ${suffix}`, address: '2 Test St', upiVpa: 'other@okhdfcbank' },
    });
    otherSocietyId = otherSociety.id;

    const owner = await prisma.user.create({
      data: { name: 'Proof Owner', email: `proof-owner-${suffix}@example.com`, passwordHash: 'x', role: 'OWNER', societyId },
    });
    ownerId = owner.id;
    createdUserIds.push(owner.id);

    const otherOwner = await prisma.user.create({
      data: {
        name: 'Other Proof Owner',
        email: `other-proof-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    otherOwnerId = otherOwner.id;
    createdUserIds.push(otherOwner.id);

    const admin = await prisma.user.create({
      data: { name: 'Proof Admin', email: `proof-admin-${suffix}@example.com`, passwordHash: 'x', role: 'ADMIN', societyId },
    });
    adminId = admin.id;
    createdUserIds.push(admin.id);

    const flat = await prisma.flat.create({
      data: { wing: 'P', flatNumber: '101', baseRate: 1000, societyId, ownerId },
    });
    flatId = flat.id;
    createdFlatIds.push(flatId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.paymentProof.deleteMany({ where: { uploadedById: { in: createdUserIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
    await prisma.$disconnect();
  });

  describe('generatePaymentQr', () => {
    it('sums the selected records and returns a UPI link + QR data URL', async () => {
      const r1 = await makeRecord('2026-01');
      const r2 = await makeRecord('2026-02');

      const result = await generatePaymentQr(ownerId, societyId, [r1.id, r2.id]);

      expect(result.amount).toBe(2000);
      expect(result.upiLink.startsWith('upi://pay?')).toBe(true);
      expect(result.upiLink).toContain('am=2000.00');
      expect(result.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('throws RecordsNotFoundError for a record that does not belong to the caller', async () => {
      const record = await prisma.maintenanceRecord.create({
        data: {
          flatId,
          period: '2026-03',
          payerType: 'OWNER',
          amount: 1000,
          dueDate: new Date('2026-12-01'),
          payerId: otherOwnerId,
        },
      });

      await expect(generatePaymentQr(ownerId, societyId, [record.id])).rejects.toThrow(RecordsNotFoundError);
    });

    it('throws RecordsNotEligibleError for a record that is not UNPAID', async () => {
      const record = await makeRecord('2026-04', 'PAID');
      await expect(generatePaymentQr(ownerId, societyId, [record.id])).rejects.toThrow(RecordsNotEligibleError);
    });
  });

  describe('uploadPaymentProof', () => {
    it('creates a proof linked to every selected record and flips them to PENDING_REVIEW', async () => {
      const r1 = await makeRecord('2026-05');
      const r2 = await makeRecord('2026-06');

      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('fake-image-bytes'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id, r2.id],
      });

      expect(proof.status).toBe('PENDING');
      expect(proof.uploadedById).toBe(ownerId);
      expect(proof.mimeType).toBe('image/jpeg');
      expect(typeof proof.fileUrl).toBe('string');

      const updated = await prisma.maintenanceRecord.findMany({ where: { id: { in: [r1.id, r2.id] } } });
      expect(updated.every((r) => r.status === 'PENDING_REVIEW')).toBe(true);

      const auditLog = await prisma.auditLog.findFirst({
        where: { entityType: 'PaymentProof', entityId: proof.id, action: 'SUBMIT_PAYMENT_PROOF' },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog!.actorId).toBe(ownerId);
    });

    it('rejects if any selected record is already mid-review or paid', async () => {
      const r1 = await makeRecord('2026-07');
      const r2 = await makeRecord('2026-08', 'PENDING_REVIEW');

      await expect(
        uploadPaymentProof(ownerId, societyId, {
          buffer: Buffer.from('x'),
          mimeType: 'image/jpeg',
          extension: '.jpg',
          maintenanceRecordIds: [r1.id, r2.id],
        }),
      ).rejects.toThrow(RecordsNotEligibleError);

      // Neither record should have been mutated — all-or-nothing.
      const untouched = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id: r1.id } });
      expect(untouched.status).toBe('UNPAID');
    });
  });

  describe('approveProof / rejectProof', () => {
    it('approve cascades the proof to APPROVED and every linked record to PAID', async () => {
      const r1 = await makeRecord('2026-09');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      const approved = await approveProof(proof.id, societyId, adminId);
      expect(approved!.status).toBe('APPROVED');
      expect(approved!.reviewedById).toBe(adminId);

      const record = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id: r1.id } });
      expect(record.status).toBe('PAID');

      const auditLog = await prisma.auditLog.findFirst({
        where: { entityType: 'PaymentProof', entityId: proof.id, action: 'APPROVE_PROOF' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('reject cascades the proof to REJECTED and every linked record back to UNPAID, with the reason stored', async () => {
      const r1 = await makeRecord('2026-10');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      const rejected = await rejectProof(proof.id, societyId, adminId, 'Screenshot is unreadable');
      expect(rejected!.status).toBe('REJECTED');
      expect(rejected!.adminNote).toBe('Screenshot is unreadable');

      const record = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id: r1.id } });
      expect(record.status).toBe('UNPAID');
    });

    it('throws ProofAlreadyReviewedError on a second approve/reject', async () => {
      const r1 = await makeRecord('2026-11');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });
      await approveProof(proof.id, societyId, adminId);

      await expect(approveProof(proof.id, societyId, adminId)).rejects.toThrow(ProofAlreadyReviewedError);
      await expect(rejectProof(proof.id, societyId, adminId)).rejects.toThrow(ProofAlreadyReviewedError);
    });

    it('returns null for a proof outside the caller society', async () => {
      const r1 = await makeRecord('2027-01');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      expect(await approveProof(proof.id, otherSocietyId, adminId)).toBeNull();
    });
  });

  describe('markRecordsPaid', () => {
    it('marks the given records PAID and writes one audit log entry per record', async () => {
      const r1 = await makeRecord('2027-02');
      const r2 = await makeRecord('2027-03');

      const result = await markRecordsPaid(societyId, adminId, [r1.id, r2.id]);
      expect(result.updated).toBe(2);

      const records = await prisma.maintenanceRecord.findMany({ where: { id: { in: [r1.id, r2.id] } } });
      expect(records.every((r) => r.status === 'PAID')).toBe(true);

      const logs = await prisma.auditLog.findMany({
        where: { action: 'MANUAL_MARK_PAID', entityId: { in: [r1.id, r2.id] } },
      });
      expect(logs).toHaveLength(2);
    });

    it('rejects if any given record is not currently UNPAID', async () => {
      const r1 = await makeRecord('2027-04', 'PAID');
      await expect(markRecordsPaid(societyId, adminId, [r1.id])).rejects.toThrow(RecordsNotEligibleError);
    });
  });

  describe('getProofForViewing', () => {
    it('lets the uploading resident view their own proof', async () => {
      const r1 = await makeRecord('2027-05');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('proof-contents'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      const result = await getProofForViewing(proof.id, ownerId, 'OWNER', societyId);
      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/jpeg');
    });

    it('lets an admin in the same society view any proof', async () => {
      const r1 = await makeRecord('2027-06');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      const result = await getProofForViewing(proof.id, adminId, 'ADMIN', societyId);
      expect(result).not.toBeNull();
    });

    it('forbids a different resident (not the uploader, not an admin) from viewing', async () => {
      const r1 = await makeRecord('2027-07');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      await expect(getProofForViewing(proof.id, otherOwnerId, 'OWNER', societyId)).rejects.toThrow(
        ForbiddenProofAccessError,
      );
    });

    it('returns null for a proof outside the caller society', async () => {
      const r1 = await makeRecord('2027-08');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      expect(await getProofForViewing(proof.id, adminId, 'ADMIN', otherSocietyId)).toBeNull();
    });
  });

  describe('listPaymentProofs', () => {
    it('filters by status', async () => {
      const r1 = await makeRecord('2027-09');
      const proof = await uploadPaymentProof(ownerId, societyId, {
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
        extension: '.jpg',
        maintenanceRecordIds: [r1.id],
      });

      const pending = await listPaymentProofs(societyId, { status: 'PENDING' });
      expect(pending.some((p) => p.id === proof.id)).toBe(true);

      const approved = await listPaymentProofs(societyId, { status: 'APPROVED' });
      expect(approved.some((p) => p.id === proof.id)).toBe(false);
    });
  });
});
