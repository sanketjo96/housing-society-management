import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { getDashboardSummary } from '../../../src/features/admin-dashboard/admin-dashboard.service';
import { changeComplaintStatus } from '../../../src/features/complaints/admin/admin-complaints.service';
import { createComplaint } from '../../../src/features/complaints/resident/resident-complaints.service';

describe('admin-dashboard service — complaint counts', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let adminId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Dashboard Complaints Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Dashboard Complaint Owner',
        email: `dash-complaint-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const admin = await prisma.user.create({
      data: {
        name: 'Dashboard Complaint Admin',
        email: `dash-complaint-admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;

    const flat = await prisma.flat.create({
      data: { wing: 'F', flatNumber: `60${suffix.slice(-2)}`, baseRate: 1000, societyId, ownerId },
    });
    flatId = flat.id;
  });

  afterAll(async () => {
    await prisma.complaint.deleteMany({ where: { societyId } });
    await prisma.flat.deleteMany({ where: { societyId } });
    await prisma.user.deleteMany({ where: { societyId } });
    await prisma.society.deleteMany({ where: { id: societyId } });
  });

  it('counts open complaints and per-status counts', async () => {
    const c1 = await createComplaint(societyId, ownerId, flatId, {
      title: 'Open one',
      possibleSolution: 'x',
      priority: 'LOW',
    });
    const c2 = await createComplaint(societyId, ownerId, flatId, {
      title: 'Open two',
      possibleSolution: 'x',
      priority: 'LOW',
    });
    const c3 = await createComplaint(societyId, ownerId, flatId, {
      title: 'Will be resolved',
      possibleSolution: 'x',
      priority: 'LOW',
    });
    await changeComplaintStatus(c3.id, societyId, adminId, 'RESOLVED');

    const summary = await getDashboardSummary(societyId);
    expect(summary.openComplaintsCount).toBe(2);
    expect(summary.complaintCountsByStatus.OPEN).toBe(2);
    expect(summary.complaintCountsByStatus.RESOLVED).toBe(1);
    expect(summary.complaintCountsByStatus.IN_PROGRESS).toBe(0);
    expect(summary.complaintCountsByStatus.REJECTED).toBe(0);

    // Not used by these assertions, but keeps eslint's no-unused-vars quiet
    // and documents that c1/c2 exist as the two Open complaints counted above.
    expect([c1.id, c2.id, c3.id]).toHaveLength(3);
  });

  it('a society with no complaints reports all-zero counts', async () => {
    const emptySociety = await prisma.society.create({
      data: { name: `Empty Complaints Society ${suffix}`, address: '2 Test St' },
    });

    const summary = await getDashboardSummary(emptySociety.id);
    expect(summary.openComplaintsCount).toBe(0);
    expect(summary.complaintCountsByStatus).toEqual({
      OPEN: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      REJECTED: 0,
    });

    await prisma.society.delete({ where: { id: emptySociety.id } });
  });
});
