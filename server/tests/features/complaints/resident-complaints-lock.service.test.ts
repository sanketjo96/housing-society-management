import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import {
  ComplaintLockedError,
  ComplaintNotFoundError,
  createComplaint,
  deleteComplaint,
  updateComplaint,
} from '../../../src/features/complaints/resident/resident-complaints.service';

describe('resident-complaints service — edit/delete lock', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Complaints Lock Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Lock Owner',
        email: `lock-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const otherOwner = await prisma.user.create({
      data: {
        name: 'Other Lock Owner',
        email: `other-lock-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    otherOwnerId = otherOwner.id;

    const flat = await prisma.flat.create({
      data: { wing: 'C', flatNumber: `30${suffix.slice(-2)}`, baseRate: 1000, societyId, ownerId },
    });
    flatId = flat.id;
  });

  afterAll(async () => {
    await prisma.complaintUpvote.deleteMany({ where: { societyId } });
    await prisma.complaint.deleteMany({ where: { societyId } });
    await prisma.flat.deleteMany({ where: { societyId } });
    await prisma.user.deleteMany({ where: { societyId } });
    await prisma.society.deleteMany({ where: { id: societyId } });
  });

  async function makeComplaint() {
    return createComplaint(societyId, ownerId, flatId, {
      title: 'Test complaint',
      possibleSolution: 'Test fix',
      priority: 'LOW',
    });
  }

  it('lets the owner edit their complaint while Open with zero upvotes', async () => {
    const complaint = await makeComplaint();
    const updated = await updateComplaint(complaint.id, societyId, ownerId, {
      title: 'Updated title',
      possibleSolution: 'Updated fix',
      priority: 'MEDIUM',
    });
    expect(updated.title).toBe('Updated title');
  });

  it('lets the owner delete their complaint while Open with zero upvotes', async () => {
    const complaint = await makeComplaint();
    await deleteComplaint(complaint.id, societyId, ownerId);
    expect(await prisma.complaint.findUnique({ where: { id: complaint.id } })).toBeNull();
  });

  it('blocks edit once the complaint has an upvote', async () => {
    const complaint = await makeComplaint();
    await prisma.complaintUpvote.create({
      data: { complaintId: complaint.id, ownerId: otherOwnerId, societyId },
    });

    await expect(
      updateComplaint(complaint.id, societyId, ownerId, {
        title: 'Should not apply',
        possibleSolution: 'x',
        priority: 'LOW',
      }),
    ).rejects.toThrow(ComplaintLockedError);
  });

  it('blocks delete once the complaint has an upvote', async () => {
    const complaint = await makeComplaint();
    await prisma.complaintUpvote.create({
      data: { complaintId: complaint.id, ownerId: otherOwnerId, societyId },
    });

    await expect(deleteComplaint(complaint.id, societyId, ownerId)).rejects.toThrow(
      ComplaintLockedError,
    );
  });

  it('blocks edit once admin moves status off Open, even with zero upvotes', async () => {
    const complaint = await makeComplaint();
    await prisma.complaint.update({ where: { id: complaint.id }, data: { status: 'IN_PROGRESS' } });

    await expect(
      updateComplaint(complaint.id, societyId, ownerId, {
        title: 'Should not apply',
        possibleSolution: 'x',
        priority: 'LOW',
      }),
    ).rejects.toThrow(ComplaintLockedError);
  });

  it('re-opens edit access once the sole upvote is removed (stateless re-check)', async () => {
    const complaint = await makeComplaint();
    const upvote = await prisma.complaintUpvote.create({
      data: { complaintId: complaint.id, ownerId: otherOwnerId, societyId },
    });

    await expect(
      updateComplaint(complaint.id, societyId, ownerId, {
        title: 'Blocked',
        possibleSolution: 'x',
        priority: 'LOW',
      }),
    ).rejects.toThrow(ComplaintLockedError);

    await prisma.complaintUpvote.delete({ where: { id: upvote.id } });

    const updated = await updateComplaint(complaint.id, societyId, ownerId, {
      title: 'Now allowed',
      possibleSolution: 'x',
      priority: 'LOW',
    });
    expect(updated.title).toBe('Now allowed');
  });

  it('refuses to edit another owner\'s complaint', async () => {
    const complaint = await makeComplaint();
    await expect(
      updateComplaint(complaint.id, societyId, otherOwnerId, {
        title: 'x',
        possibleSolution: 'x',
        priority: 'LOW',
      }),
    ).rejects.toThrow(ComplaintNotFoundError);
  });

  it('refuses to delete another owner\'s complaint', async () => {
    const complaint = await makeComplaint();
    await expect(deleteComplaint(complaint.id, societyId, otherOwnerId)).rejects.toThrow(
      ComplaintNotFoundError,
    );
  });

  it('editing a nonexistent complaint throws ComplaintNotFoundError', async () => {
    await expect(
      updateComplaint('does-not-exist', societyId, ownerId, {
        title: 'x',
        possibleSolution: 'x',
        priority: 'LOW',
      }),
    ).rejects.toThrow(ComplaintNotFoundError);
  });
});
