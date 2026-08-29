import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import {
  ComplaintNotFoundError,
  createComplaint,
  listComplaints,
  unvoteComplaint,
  upvoteComplaint,
} from '../../../src/features/complaints/resident/resident-complaints.service';

describe('resident-complaints service — upvote toggle', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Complaints Upvote Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Upvote Owner',
        email: `upvote-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const otherOwner = await prisma.user.create({
      data: {
        name: 'Other Upvote Owner',
        email: `other-upvote-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    otherOwnerId = otherOwner.id;

    const flat = await prisma.flat.create({
      data: { wing: 'D', flatNumber: `40${suffix.slice(-2)}`, baseRate: 1000, societyId, ownerId },
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
      title: 'Upvote test complaint',
      possibleSolution: 'Fix it',
      priority: 'LOW',
    });
  }

  async function upvoteCountOf(id: string) {
    const list = await listComplaints(societyId, ownerId);
    return list.find((c) => c.id === id)?.upvoteCount ?? -1;
  }

  it('lets an owner upvote a complaint', async () => {
    const complaint = await makeComplaint();
    await upvoteComplaint(complaint.id, societyId, otherOwnerId);
    expect(await upvoteCountOf(complaint.id)).toBe(1);
  });

  it('lets an owner upvote their own complaint', async () => {
    const complaint = await makeComplaint();
    await upvoteComplaint(complaint.id, societyId, ownerId);
    expect(await upvoteCountOf(complaint.id)).toBe(1);
  });

  it('upvoting twice from the same owner is a no-op, not an error', async () => {
    const complaint = await makeComplaint();
    await upvoteComplaint(complaint.id, societyId, otherOwnerId);
    await expect(upvoteComplaint(complaint.id, societyId, otherOwnerId)).resolves.not.toThrow();
    expect(await upvoteCountOf(complaint.id)).toBe(1);
  });

  it('lets an owner remove their upvote', async () => {
    const complaint = await makeComplaint();
    await upvoteComplaint(complaint.id, societyId, otherOwnerId);
    await unvoteComplaint(complaint.id, societyId, otherOwnerId);
    expect(await upvoteCountOf(complaint.id)).toBe(0);
  });

  it('myUpvoted reflects only the requesting caller\'s own vote', async () => {
    const complaint = await makeComplaint();
    await upvoteComplaint(complaint.id, societyId, otherOwnerId);

    const asUpvoter = await listComplaints(societyId, otherOwnerId);
    expect(asUpvoter.find((c) => c.id === complaint.id)?.myUpvoted).toBe(true);

    const asNonUpvoter = await listComplaints(societyId, ownerId);
    expect(asNonUpvoter.find((c) => c.id === complaint.id)?.myUpvoted).toBe(false);
  });

  it('un-upvoting when no upvote exists is a no-op 204, not an error', async () => {
    const complaint = await makeComplaint();
    await expect(unvoteComplaint(complaint.id, societyId, otherOwnerId)).resolves.not.toThrow();
    expect(await upvoteCountOf(complaint.id)).toBe(0);
  });

  it('two different owners upvoting the same complaint both count', async () => {
    const complaint = await makeComplaint();
    await upvoteComplaint(complaint.id, societyId, ownerId);
    await upvoteComplaint(complaint.id, societyId, otherOwnerId);
    expect(await upvoteCountOf(complaint.id)).toBe(2);
  });

  it('upvoting a nonexistent complaint throws ComplaintNotFoundError', async () => {
    await expect(upvoteComplaint('does-not-exist', societyId, ownerId)).rejects.toThrow(
      ComplaintNotFoundError,
    );
  });
});
