import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';

describe('PaymentProof, NotificationLog, AuditLog models', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let adminId: string;
  let flatId: string;
  const recordIds: string[] = [];
  let proofId: string;
  let auditLogId: string;

  afterAll(async () => {
    if (auditLogId) await prisma.auditLog.delete({ where: { id: auditLogId } });
    if (proofId) await prisma.paymentProof.delete({ where: { id: proofId } });
    await prisma.maintenanceRecord.deleteMany({ where: { id: { in: recordIds } } });
    if (flatId) await prisma.flat.delete({ where: { id: flatId } });
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (adminId) await prisma.user.delete({ where: { id: adminId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('links a PaymentProof to multiple MaintenanceRecords, transitions PENDING -> APPROVED, and an AuditLog can reference it', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Test Owner',
        email: `owner-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'OWNER',
        societyId: society.id,
      },
    });
    ownerId = owner.id;

    const admin = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: `admin-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        societyId: society.id,
      },
    });
    adminId = admin.id;

    const flat = await prisma.flat.create({
      data: {
        wing: 'A',
        flatNumber: `101-${suffix}`,
        baseRate: 1000,
        societyId: society.id,
        ownerId: owner.id,
      },
    });
    flatId = flat.id;

    for (const period of ['2026-01', '2026-02']) {
      const record = await prisma.maintenanceRecord.create({
        data: {
          flatId: flat.id,
          period,
          payerType: 'OWNER',
          amount: 1000,
          dueDate: new Date('2026-03-01'),
          payerId: owner.id,
        },
      });
      recordIds.push(record.id);
    }

    // Resident selects both unpaid months and submits one proof covering both.
    const proof = await prisma.paymentProof.create({
      data: {
        fileUrl: '/uploads/proofs/test.jpg',
        mimeType: 'image/jpeg',
        uploadedById: owner.id,
        maintenanceRecords: { connect: recordIds.map((id) => ({ id })) },
      },
    });
    proofId = proof.id;

    const proofWithRecords = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proof.id },
      include: { maintenanceRecords: true },
    });
    expect(proofWithRecords.status).toBe('PENDING');
    expect(proofWithRecords.maintenanceRecords).toHaveLength(2);

    const approved = await prisma.paymentProof.update({
      where: { id: proof.id },
      data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: new Date() },
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedById).toBe(admin.id);

    const auditLog = await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'APPROVE_PROOF',
        entityType: 'PaymentProof',
        entityId: proof.id,
      },
    });
    auditLogId = auditLog.id;

    expect(auditLog.entityId).toBe(proof.id);
    expect(auditLog.actorId).toBe(admin.id);
  });
});
