import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createComplaint } from '../../../src/features/complaints/resident/resident-complaints.service';
import {
  changeComplaintStatus,
  ComplaintNotFoundError,
} from '../../../src/features/complaints/admin/admin-complaints.service';

describe('admin-complaints service — status transitions', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Admin Complaints Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Admin Complaints Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Status Owner',
        email: `status-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const flat = await prisma.flat.create({
      data: { wing: 'E', flatNumber: `50${suffix.slice(-2)}`, baseRate: 1000, societyId, ownerId },
    });
    flatId = flat.id;
  });

  afterAll(async () => {
    const societies = [societyId, otherSocietyId];
    await prisma.complaint.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.flat.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.user.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.society.deleteMany({ where: { id: { in: societies } } });
  });

  async function makeComplaint() {
    return createComplaint(societyId, ownerId, flatId, {
      title: 'Status test complaint',
      possibleSolution: 'Fix it',
      priority: 'LOW',
    });
  }

  it('moves a complaint from Open to In Progress', async () => {
    const complaint = await makeComplaint();
    const updated = await changeComplaintStatus(complaint.id, societyId, 'IN_PROGRESS');
    expect(updated.status).toBe('IN_PROGRESS');
  });

  it('moves a complaint through the full happy path to Resolved', async () => {
    const complaint = await makeComplaint();
    await changeComplaintStatus(complaint.id, societyId, 'IN_PROGRESS');
    const resolved = await changeComplaintStatus(complaint.id, societyId, 'RESOLVED');
    expect(resolved.status).toBe('RESOLVED');
  });

  it('allows reverting from Resolved back to Open — no restricted transitions', async () => {
    const complaint = await makeComplaint();
    await changeComplaintStatus(complaint.id, societyId, 'RESOLVED');
    const reverted = await changeComplaintStatus(complaint.id, societyId, 'OPEN');
    expect(reverted.status).toBe('OPEN');
  });

  it('allows moving straight to Rejected from Open', async () => {
    const complaint = await makeComplaint();
    const rejected = await changeComplaintStatus(complaint.id, societyId, 'REJECTED');
    expect(rejected.status).toBe('REJECTED');
  });

  it('never leaks a complaint from another society', async () => {
    await expect(changeComplaintStatus('does-not-exist', otherSocietyId, 'IN_PROGRESS')).rejects.toThrow(
      ComplaintNotFoundError,
    );
  });

  it('changing status of a nonexistent complaint throws ComplaintNotFoundError', async () => {
    await expect(changeComplaintStatus('does-not-exist', societyId, 'IN_PROGRESS')).rejects.toThrow(
      ComplaintNotFoundError,
    );
  });
});
