import type { ProofStatus, Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { getStorageAdapter } from '../lib/storage';
import { buildUpiDeepLink, generateQrDataUrl } from '../lib/upi';

// Domain errors specific to the payment-proofs flow — co-located here rather than
// lib/errors.ts, matching flats.service.ts's precedent (lib/errors.ts is only for
// errors genuinely shared across multiple services, e.g. DuplicateFieldError).
export class RecordsNotFoundError extends Error {
  constructor() {
    super('One or more selected records were not found');
    this.name = 'RecordsNotFoundError';
  }
}

export class RecordsNotEligibleError extends Error {
  constructor(public readonly recordIds: string[]) {
    super('One or more selected records are not currently unpaid');
    this.name = 'RecordsNotEligibleError';
  }
}

export class ProofAlreadyReviewedError extends Error {
  constructor() {
    super('This payment proof has already been reviewed');
    this.name = 'ProofAlreadyReviewedError';
  }
}

export class ForbiddenProofAccessError extends Error {
  constructor() {
    super('You do not have access to this payment proof');
    this.name = 'ForbiddenProofAccessError';
  }
}

// Shared by QR generation and proof upload (rule 6/7, CLAUDE.md): a resident may only
// select their own currently-UNPAID records — never someone else's, never one that's
// already mid-review or settled. Society-scoped via the flat relation, defense in
// depth alongside payerId (Task 2.6 convention).
async function loadOwnUnpaidRecords(payerId: string, societyId: string, ids: string[]) {
  const records = await prisma.maintenanceRecord.findMany({
    where: { id: { in: ids }, payerId, flat: { societyId } },
  });
  if (records.length !== ids.length) throw new RecordsNotFoundError();

  const notUnpaid = records.filter((r) => r.status !== 'UNPAID');
  if (notUnpaid.length > 0) throw new RecordsNotEligibleError(notUnpaid.map((r) => r.id));

  return records;
}

export interface PaymentQrResult {
  amount: number;
  upiLink: string;
  qrDataUrl: string;
}

// Task 6.1 — stateless: no DB row is written here. The actual "these records are now
// mid-payment" transition happens at proof upload (uploadPaymentProof, below), matching
// the mockup flow: select a subset, see a QR, pay externally, then upload proof.
export async function generatePaymentQr(
  payerId: string,
  societyId: string,
  maintenanceRecordIds: string[],
): Promise<PaymentQrResult> {
  const records = await loadOwnUnpaidRecords(payerId, societyId, maintenanceRecordIds);
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });

  const amount = records.reduce((sum, r) => sum + Number(r.amount), 0);
  const upiLink = buildUpiDeepLink({
    vpa: society.upiVpa,
    payeeName: society.name,
    amount,
    note: `Maintenance (${records.length} record${records.length > 1 ? 's' : ''})`,
  });
  const qrDataUrl = await generateQrDataUrl(upiLink);

  return { amount, upiLink, qrDataUrl };
}

export interface UploadPaymentProofInput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  maintenanceRecordIds: string[];
}

// Task 6.2 — rule 7's upload step: one proof, many selected records, every selected
// record flips to PENDING_REVIEW together. The storage write happens *before* the DB
// transaction (external I/O has no place inside a Postgres transaction — it would hold
// the transaction open across a slow disk/network write for no benefit); a save that
// succeeds but is never linked to a DB row is a harmless orphan file, while the reverse
// (a DB row referencing a file that failed to save) would not be.
export async function uploadPaymentProof(
  payerId: string,
  societyId: string,
  input: UploadPaymentProofInput,
) {
  const records = await loadOwnUnpaidRecords(payerId, societyId, input.maintenanceRecordIds);

  const { key } = await getStorageAdapter().save({
    buffer: input.buffer,
    societyId,
    extension: input.extension,
  });

  return prisma.$transaction(async (tx) => {
    const proof = await tx.paymentProof.create({
      data: {
        fileUrl: key,
        mimeType: input.mimeType,
        uploadedById: payerId,
        maintenanceRecords: { connect: records.map((r) => ({ id: r.id })) },
      },
    });
    await tx.maintenanceRecord.updateMany({
      where: { id: { in: records.map((r) => r.id) } },
      data: { status: 'PENDING_REVIEW' },
    });
    await tx.auditLog.create({
      data: {
        actorId: payerId,
        action: 'SUBMIT_PAYMENT_PROOF',
        entityType: 'PaymentProof',
        entityId: proof.id,
        note: `${records.length} record(s) totalling ${records.reduce((s, r) => s + Number(r.amount), 0)}`,
      },
    });
    return proof;
  });
}

const PROOF_LIST_INCLUDE = {
  uploadedBy: { select: { id: true, name: true, email: true } },
  maintenanceRecords: {
    include: { flat: { select: { id: true, wing: true, flatNumber: true } } },
  },
} as const;

// Task 6.4 — admin review queue, optionally filtered by status (defaults to every
// proof, though the frontend queue only ever asks for PENDING).
export async function listPaymentProofs(societyId: string, filters: { status?: ProofStatus } = {}) {
  return prisma.paymentProof.findMany({
    where: {
      uploadedBy: { societyId },
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: PROOF_LIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

// Task 6.3 — authenticated file access, never public. Returns null for "not found or
// wrong society" (404, same convention as every other scoped lookup in this codebase);
// throws ForbiddenProofAccessError for "found, right society, but not this resident's
// own proof and the requester isn't an admin" (403 — a distinct case from 404, since
// leaking "this id exists" isn't the same risk as leaking someone else's proof image).
export async function getProofForViewing(proofId: string, requesterId: string, requesterRole: Role, societyId: string) {
  const proof = await prisma.paymentProof.findFirst({
    where: { id: proofId, uploadedBy: { societyId } },
  });
  if (!proof) return null;

  if (requesterRole !== 'ADMIN' && proof.uploadedById !== requesterId) {
    throw new ForbiddenProofAccessError();
  }

  const stream = await getStorageAdapter().read(proof.fileUrl);
  return { stream, mimeType: proof.mimeType };
}

// Task 6.5 — approve cascades PaymentProof -> APPROVED and every linked
// MaintenanceRecord -> PAID, together, one transaction (rule 7).
export async function approveProof(proofId: string, societyId: string, adminId: string) {
  const proof = await prisma.paymentProof.findFirst({
    where: { id: proofId, uploadedBy: { societyId } },
    include: { maintenanceRecords: true },
  });
  if (!proof) return null;
  if (proof.status !== 'PENDING') throw new ProofAlreadyReviewedError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paymentProof.update({
      where: { id: proofId },
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
      include: PROOF_LIST_INCLUDE,
    });
    await tx.maintenanceRecord.updateMany({
      where: { id: { in: proof.maintenanceRecords.map((r) => r.id) } },
      data: { status: 'PAID' },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'APPROVE_PROOF',
        entityType: 'PaymentProof',
        entityId: proofId,
        note: `${proof.maintenanceRecords.length} record(s) marked PAID`,
      },
    });
    return updated;
  });
}

// Task 6.6 — reject reverts every linked record back to UNPAID (rule 7), so the
// resident can re-select and re-upload; adminNote carries the optional reason.
export async function rejectProof(proofId: string, societyId: string, adminId: string, reason?: string) {
  const proof = await prisma.paymentProof.findFirst({
    where: { id: proofId, uploadedBy: { societyId } },
    include: { maintenanceRecords: true },
  });
  if (!proof) return null;
  if (proof.status !== 'PENDING') throw new ProofAlreadyReviewedError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paymentProof.update({
      where: { id: proofId },
      data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), adminNote: reason },
      include: PROOF_LIST_INCLUDE,
    });
    await tx.maintenanceRecord.updateMany({
      where: { id: { in: proof.maintenanceRecords.map((r) => r.id) } },
      data: { status: 'UNPAID' },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'REJECT_PROOF',
        entityType: 'PaymentProof',
        entityId: proofId,
        note: reason ?? `${proof.maintenanceRecords.length} record(s) reverted to UNPAID`,
      },
    });
    return updated;
  });
}

// Task 6.7 — manual "mark as paid" fallback for cash/bank-transfer, no proof involved.
// Logged as MANUAL_MARK_PAID specifically so it's distinguishable in the audit trail
// from QR-flow approvals (rule 7's explicit requirement) — one AuditLog row per
// record, since there's no single parent entity (unlike a PaymentProof) to hang one
// combined entry off of.
export async function markRecordsPaid(societyId: string, adminId: string, maintenanceRecordIds: string[]) {
  const records = await prisma.maintenanceRecord.findMany({
    where: { id: { in: maintenanceRecordIds }, flat: { societyId } },
  });
  if (records.length !== maintenanceRecordIds.length) throw new RecordsNotFoundError();

  const notUnpaid = records.filter((r) => r.status !== 'UNPAID');
  if (notUnpaid.length > 0) throw new RecordsNotEligibleError(notUnpaid.map((r) => r.id));

  return prisma.$transaction(async (tx) => {
    await tx.maintenanceRecord.updateMany({
      where: { id: { in: maintenanceRecordIds } },
      data: { status: 'PAID' },
    });
    await Promise.all(
      records.map((r) =>
        tx.auditLog.create({
          data: {
            actorId: adminId,
            action: 'MANUAL_MARK_PAID',
            entityType: 'MaintenanceRecord',
            entityId: r.id,
            note: `${r.period}, amount ${r.amount}`,
          },
        }),
      ),
    );
    return { updated: records.length };
  });
}
