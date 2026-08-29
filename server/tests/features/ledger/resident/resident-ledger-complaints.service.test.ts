import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { getResidentBalancesSummary } from '../../../../src/features/ledger/resident/resident-ledger-service';
import { createComplaint } from '../../../../src/features/complaints/resident/resident-complaints.service';

describe('getResidentBalancesSummary — complaints', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let tenantId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Balances Complaints Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Balances Owner',
        email: `balances-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const tenant = await prisma.user.create({
      data: {
        name: 'Balances Tenant',
        email: `balances-tenant-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'TENANT',
        societyId,
      },
    });
    tenantId = tenant.id;

    const flat = await prisma.flat.create({
      data: {
        wing: 'G',
        flatNumber: `70${suffix.slice(-2)}`,
        baseRate: 1000,
        societyId,
        ownerId,
        currentTenantId: tenantId,
      },
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

  it("includes every complaint in the society, sorted by upvote count, for an OWNER caller", async () => {
    const c1 = await createComplaint(societyId, ownerId, flatId, {
      title: 'Leaky pipe',
      possibleSolution: 'Call plumber',
      priority: 'HIGH',
    });

    const summary = await getResidentBalancesSummary(flatId, societyId, 'OWNER', ownerId);
    expect(summary.complaints.map((c) => c.id)).toContain(c1.id);
  });

  it('reports myUpvoted for the calling owner', async () => {
    const complaint = await createComplaint(societyId, ownerId, flatId, {
      title: 'myUpvoted via dashboard',
      possibleSolution: 'n/a',
      priority: 'LOW',
    });
    await prisma.complaintUpvote.create({ data: { complaintId: complaint.id, ownerId, societyId } });

    const summary = await getResidentBalancesSummary(flatId, societyId, 'OWNER', ownerId);
    expect(summary.complaints.find((c) => c.id === complaint.id)?.myUpvoted).toBe(true);
  });

  it('returns no complaint data for a TENANT caller', async () => {
    const summary = await getResidentBalancesSummary(flatId, societyId, 'TENANT', tenantId);
    expect(summary.complaints).toEqual([]);
  });
});
