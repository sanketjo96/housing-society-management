// Resident (OWNER-only) complaint create/list/image-serving. Shared,
// society-wide visibility — list() returns every complaint in the society,
// not just the caller's own (docs/features/complaints/01-requirements.md
// Confirmed Product Decision #2). Every create writes an AuditLog row in
// the same transaction, following other-charges.service.ts's pattern.
import { prisma } from '../../../infrastructure/prisma/client';
import type { ComplaintPriority } from '../../../infrastructure/prisma/generated/client';
import { getStorageAdapter } from '../../../infrastructure/storage';
import { scopedWhere } from '../../../shared/security/tenant-scope';

export class ComplaintNotFoundError extends Error {
  constructor() {
    super('Complaint not found');
    this.name = 'ComplaintNotFoundError';
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

// Any owner in the society may view any complaint's image — visibility is
// shared, not restricted to the complaint's own owner (see listComplaints).
export async function getComplaintFileForViewing(id: string, societyId: string) {
  const complaint = await prisma.complaint.findFirst({ where: scopedWhere(societyId, { id }) });
  if (!complaint || !complaint.fileUrl) return null;

  const stream = await getStorageAdapter().read(complaint.fileUrl);
  return { stream, mimeType: complaint.mimeType ?? 'application/octet-stream' };
}
