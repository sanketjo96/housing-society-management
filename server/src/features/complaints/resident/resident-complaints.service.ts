// Resident (OWNER-only) complaint create/list/image-serving. Shared,
// society-wide visibility — list() returns every complaint in the society,
// not just the caller's own (docs/features/complaints/01-requirements.md
// Confirmed Product Decision #2). Every create writes an AuditLog row in
// the same transaction, following other-charges.service.ts's pattern.
import { prisma } from '../../../infrastructure/prisma/client';
import type { ComplaintPriority } from '../../../infrastructure/prisma/generated/client';
import { getStorageAdapter } from '../../../infrastructure/storage';
import { isEditable } from '../../../shared/complaints/complaint-lock';
import { scopedWhere } from '../../../shared/security/tenant-scope';

export class ComplaintNotFoundError extends Error {
  constructor() {
    super('Complaint not found');
    this.name = 'ComplaintNotFoundError';
  }
}

// Thrown when status !== OPEN or upvoteCount !== 0 at the moment of the
// request — a live re-check, not a one-way flag (see shared/complaints/
// complaint-lock.ts and 01-requirements.md Confirmed Product Decision #7).
export class ComplaintLockedError extends Error {
  constructor() {
    super('This complaint can no longer be edited or deleted');
    this.name = 'ComplaintLockedError';
  }
}

interface ComplaintFileInput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export interface CreateComplaintInput {
  title: string;
  possibleSolution: string;
  priority: ComplaintPriority;
  file?: ComplaintFileInput;
}

export async function createComplaint(
  societyId: string,
  ownerId: string,
  flatId: string,
  input: CreateComplaintInput,
) {
  let fileUrl: string | undefined;
  let mimeType: string | undefined;
  if (input.file) {
    const saved = await getStorageAdapter().save({
      buffer: input.file.buffer,
      societyId,
      extension: input.file.extension,
    });
    fileUrl = saved.key;
    mimeType = input.file.mimeType;
  }

  return prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.create({
      data: {
        societyId,
        ownerId,
        flatId,
        title: input.title,
        possibleSolution: input.possibleSolution,
        priority: input.priority,
        fileUrl,
        mimeType,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: ownerId,
        action: 'CREATE_COMPLAINT',
        entityType: 'Complaint',
        entityId: complaint.id,
        note: complaint.title,
      },
    });
    return complaint;
  });
}

// Society-wide, ranked by upvote count — this is the shared browse-and-upvote
// surface, not a "my complaints" list. See Confirmed Product Decision #2.
export async function listComplaints(societyId: string) {
  const complaints = await prisma.complaint.findMany({
    where: scopedWhere(societyId),
    include: {
      owner: { select: { id: true, name: true } },
      flat: { select: { wing: true, flatNumber: true } },
      _count: { select: { upvotes: true } },
    },
    orderBy: [{ upvotes: { _count: 'desc' } }, { createdAt: 'desc' }],
  });

  return complaints.map((c) => ({
    id: c.id,
    title: c.title,
    possibleSolution: c.possibleSolution,
    priority: c.priority,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    owner: c.owner,
    flat: c.flat,
    hasImage: c.fileUrl != null,
    upvoteCount: c._count.upvotes,
  }));
}

export interface UpdateComplaintInput {
  title: string;
  possibleSolution: string;
  priority: ComplaintPriority;
  file?: ComplaintFileInput;
}

// Re-reads status and re-counts upvotes inside the same transaction as the
// write, so this can never act on a value read earlier in the request — the
// one thing that closes the race between an incoming upvote and an
// in-flight edit. ownerId is part of the lookup, not checked after the
// fact: a nonexistent id and someone else's complaint both resolve to
// ComplaintNotFoundError, same "one error for every non-owning case"
// precedent as VehicleNotFoundError.
export async function updateComplaint(
  id: string,
  societyId: string,
  ownerId: string,
  input: UpdateComplaintInput,
) {
  let fileUrl: string | undefined;
  let mimeType: string | undefined;
  if (input.file) {
    const saved = await getStorageAdapter().save({
      buffer: input.file.buffer,
      societyId,
      extension: input.file.extension,
    });
    fileUrl = saved.key;
    mimeType = input.file.mimeType;
  }

  return prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.findFirst({
      where: scopedWhere(societyId, { id, ownerId }),
    });
    if (!complaint) throw new ComplaintNotFoundError();

    const upvoteCount = await tx.complaintUpvote.count({ where: { complaintId: id } });
    if (!isEditable(complaint.status, upvoteCount)) throw new ComplaintLockedError();

    const updated = await tx.complaint.update({
      where: { id },
      data: {
        title: input.title,
        possibleSolution: input.possibleSolution,
        priority: input.priority,
        ...(input.file ? { fileUrl, mimeType } : {}),
      },
    });
    await tx.auditLog.create({
      data: { actorId: ownerId, action: 'EDIT_COMPLAINT', entityType: 'Complaint', entityId: id },
    });
    return updated;
  });
}

// Same live lock check as updateComplaint, inside the same transaction.
export async function deleteComplaint(id: string, societyId: string, ownerId: string) {
  await prisma.$transaction(async (tx) => {
    const complaint = await tx.complaint.findFirst({
      where: scopedWhere(societyId, { id, ownerId }),
    });
    if (!complaint) throw new ComplaintNotFoundError();

    const upvoteCount = await tx.complaintUpvote.count({ where: { complaintId: id } });
    if (!isEditable(complaint.status, upvoteCount)) throw new ComplaintLockedError();

    await tx.complaint.delete({ where: { id } });
    await tx.auditLog.create({
      data: { actorId: ownerId, action: 'DELETE_COMPLAINT', entityType: 'Complaint', entityId: id },
    });
  });
}

// Any owner in the society may view any complaint's image — visibility is
// shared, not restricted to the complaint's own owner (see listComplaints).
export async function getComplaintFileForViewing(id: string, societyId: string) {
  const complaint = await prisma.complaint.findFirst({ where: scopedWhere(societyId, { id }) });
  if (!complaint || !complaint.fileUrl) return null;

  const stream = await getStorageAdapter().read(complaint.fileUrl);
  return { stream, mimeType: complaint.mimeType ?? 'application/octet-stream' };
}
