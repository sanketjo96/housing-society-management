import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import {
  createComplaint,
  getComplaintFileForViewing,
  listComplaints,
} from '../../../src/features/complaints/resident/resident-complaints.service';

describe('resident-complaints service — create/list', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let flatId: string;
  let flatNumber: string;
  let otherFlatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Complaints Test Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Complaints Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Complaint Owner',
        email: `complaint-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const otherOwner = await prisma.user.create({
      data: {
        name: 'Other Owner',
        email: `other-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId: otherSocietyId,
      },
    });
    otherOwnerId = otherOwner.id;

    flatNumber = `10${suffix.slice(-2)}`;
    const flat = await prisma.flat.create({
      data: { wing: 'A', flatNumber, baseRate: 1000, societyId, ownerId },
    });
    flatId = flat.id;

    const otherFlat = await prisma.flat.create({
      data: {
        wing: 'B',
        flatNumber: `20${suffix.slice(-2)}`,
        baseRate: 1000,
        societyId: otherSocietyId,
        ownerId: otherOwnerId,
      },
    });
    otherFlatId = otherFlat.id;
  });

  afterAll(async () => {
    const societies = [societyId, otherSocietyId];
    await prisma.complaintUpvote.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.complaint.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.flat.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.user.deleteMany({ where: { societyId: { in: societies } } });
    await prisma.society.deleteMany({ where: { id: { in: societies } } });
  });

  it('creates a complaint with Open status and no upvotes', async () => {
    const complaint = await createComplaint(societyId, ownerId, flatId, {
      title: 'Leaky pipe in the basement',
      possibleSolution: 'Call the plumber on the AMC',
      priority: 'HIGH',
    });

    expect(complaint.status).toBe('OPEN');

    const list = await listComplaints(societyId, ownerId);
    const found = list.find((c) => c.id === complaint.id);
    expect(found).toBeTruthy();
    expect(found?.upvoteCount).toBe(0);
    expect(found?.owner.id).toBe(ownerId);
    expect(found?.flat.flatNumber).toBe(flatNumber);
  });


  it('lists every complaint in the society, not just the caller\'s own', async () => {
    const complaint = await createComplaint(societyId, ownerId, flatId, {
      title: 'Security gate not closing',
      possibleSolution: 'Oil the hinge',
      priority: 'MEDIUM',
    });

    const list = await listComplaints(societyId, ownerId);
    expect(list.map((c) => c.id)).toContain(complaint.id);
  });

  it('never leaks a complaint from another society', async () => {
    const otherComplaint = await createComplaint(otherSocietyId, otherOwnerId, otherFlatId, {
      title: 'Cross-society complaint',
      possibleSolution: 'n/a',
      priority: 'LOW',
    });

    const list = await listComplaints(societyId, ownerId);
    expect(list.map((c) => c.id)).not.toContain(otherComplaint.id);
  });

  it('serving a complaint with no image returns null', async () => {
    const complaint = await createComplaint(societyId, ownerId, flatId, {
      title: 'No image here',
      possibleSolution: 'n/a',
      priority: 'LOW',
    });

    const result = await getComplaintFileForViewing(complaint.id, societyId);
    expect(result).toBeNull();
  });

  it('reports myUpvoted per caller, not a global flag', async () => {
    const complaint = await createComplaint(societyId, ownerId, flatId, {
      title: 'myUpvoted test',
      possibleSolution: 'n/a',
      priority: 'LOW',
    });
    await prisma.complaintUpvote.create({
      data: { complaintId: complaint.id, ownerId, societyId },
    });

    const listAsUpvoter = await listComplaints(societyId, ownerId);
    expect(listAsUpvoter.find((c) => c.id === complaint.id)?.myUpvoted).toBe(true);

    const otherOwnerInSameSociety = await prisma.user.create({
      data: {
        name: 'Non-upvoter',
        email: `non-upvoter-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    const listAsNonUpvoter = await listComplaints(societyId, otherOwnerInSameSociety.id);
    expect(listAsNonUpvoter.find((c) => c.id === complaint.id)?.myUpvoted).toBe(false);
  });
});
