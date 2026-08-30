// Admin-only status management. Deliberately no state-machine/transition
// guard — admin may move a complaint to any status, in any direction, at
// any time (docs/features/complaints/01-requirements.md Confirmed Product
// Decision #5). Admin never edits/deletes complaint content — Rejected is
// the only moderation tool (Confirmed Product Decision #6).
import { prisma } from '../../../infrastructure/prisma/client';
import type { ComplaintStatus } from '../../../infrastructure/prisma/generated/client';
import { scopedWhere } from '../../../shared/security/tenant-scope';

export class ComplaintNotFoundError extends Error {
  constructor() {
    super('Complaint not found');
    this.name = 'ComplaintNotFoundError';
  }
}

export async function changeComplaintStatus(id: string, societyId: string, status: ComplaintStatus) {
  const complaint = await prisma.complaint.findFirst({ where: scopedWhere(societyId, { id }) });
  if (!complaint) throw new ComplaintNotFoundError();

  return prisma.complaint.update({ where: { id }, data: { status } });
}
