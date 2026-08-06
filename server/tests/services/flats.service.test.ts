import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DuplicateFieldError } from '../../src/lib/errors';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { ConflictingRoleError, createFlat, updateFlat } from '../../src/services/flats.service';

// Unlike tests/routes/flats.test.ts, this calls the service directly — no HTTP, no
// supertest (see tests/services/admin-users.service.test.ts for the same rationale).
//
// createFlat/updateFlat find-or-create the owner/tenant User accounts from contact
// fields (name/phone/email), rather than requiring a pre-existing ownerId/tenantId —
// see CLAUDE.md's "Addition (2026-08-06)".
describe('flats service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let existingTenantEmail: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Test St', upiVpa: 'other@okhdfcbank' },
    });
    otherSocietyId = otherSociety.id;

    const existingTenant = await createUser({
      name: 'Existing Tenant',
      email: `flat-existing-tenant-${suffix}@example.com`,
      password: 'password-123',
      role: 'TENANT',
      societyId,
    });
    createdUserIds.push(existingTenant.id);
    existingTenantEmail = existingTenant.email;
  });

  // Owners/tenants are created dynamically inside createFlat/updateFlat now (not
  // pre-created and tracked one by one), so cleanup is scoped by society rather than
  // by an explicit id list.
  afterAll(async () => {
    const societyIds = [societyId, otherSocietyId];
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = await prisma.user
      .findMany({ where: { societyId: { in: societyIds } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
    await prisma.$disconnect();
  });

  it('creates a flat, provisioning a brand-new owner account with a working password-reset token', async () => {
    const email = `flat-new-owner-${suffix}@example.com`;
    const flat = await createFlat({
      societyId,
      wing: 'A',
      flatNumber: '101',
      baseRate: 1500,
      ownerName: 'New Owner',
      ownerEmail: email,
    });
    createdFlatIds.push(flat!.id);

    expect(flat!.wing).toBe('A');
    expect(Number(flat!.baseRate)).toBe(1500);
    expect(flat!.owner.email).toBe(email);

    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(ownerUser.role).toBe('OWNER');
    const resetToken = await prisma.passwordResetToken.findFirst({ where: { userId: ownerUser.id } });
    expect(resetToken).not.toBeNull();
  });

  it('reuses an existing OWNER account by email, updating their contact info in place', async () => {
    const email = `flat-reused-owner-${suffix}@example.com`;
    const first = await createFlat({
      societyId,
      wing: 'A',
      flatNumber: '102',
      baseRate: 1500,
      ownerName: 'Owner Original Name',
      ownerEmail: email,
    });
    createdFlatIds.push(first!.id);
    const ownerId = first!.ownerId;

    const second = await createFlat({
      societyId,
      wing: 'A',
      flatNumber: '103',
      baseRate: 1600,
      ownerName: 'Owner Renamed',
      ownerEmail: email,
    });
    createdFlatIds.push(second!.id);

    expect(second!.ownerId).toBe(ownerId);
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(ownerUser.name).toBe('Owner Renamed');
  });

  it('throws ConflictingRoleError when ownerEmail already belongs to a non-OWNER user', async () => {
    await expect(
      createFlat({
        societyId,
        wing: 'A',
        flatNumber: '104',
        baseRate: 1500,
        ownerName: 'Should Fail',
        ownerEmail: existingTenantEmail,
      }),
    ).rejects.toBeInstanceOf(ConflictingRoleError);
  });

  it('throws DuplicateFieldError for a duplicate wing+flatNumber within the same society', async () => {
    const first = await createFlat({
      societyId,
      wing: 'B',
      flatNumber: '201',
      baseRate: 1500,
      ownerName: 'Owner B',
      ownerEmail: `flat-b-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(first!.id);

    await expect(
      createFlat({
        societyId,
        wing: 'B',
        flatNumber: '201',
        baseRate: 1600,
        ownerName: 'Owner B2',
        ownerEmail: `flat-b2-owner-${suffix}@example.com`,
      }),
    ).rejects.toBeInstanceOf(DuplicateFieldError);
  });

  it('allows the same wing+flatNumber combination across two different societies', async () => {
    const flat = await createFlat({
      societyId: otherSocietyId,
      wing: 'B',
      flatNumber: '201',
      baseRate: 1500,
      ownerName: 'Other Society Owner',
      ownerEmail: `flat-other-society-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat!.id);
    expect(flat!.wing).toBe('B');
  });

  it('creates a flat with a tenant in one call when occupancy is "tenant"', async () => {
    const tenantEmail = `flat-inline-tenant-${suffix}@example.com`;
    const flat = await createFlat({
      societyId,
      wing: 'C',
      flatNumber: '301',
      baseRate: 1500,
      ownerName: 'Owner C',
      ownerEmail: `flat-c-owner-${suffix}@example.com`,
      occupancy: 'tenant',
      tenantName: 'Inline Tenant',
      tenantEmail,
    });
    createdFlatIds.push(flat!.id);

    expect(flat!.currentTenant?.email).toBe(tenantEmail);
    const occupancy = await prisma.occupancyChange.findFirst({ where: { flatId: flat!.id, effectiveEnd: null } });
    expect(occupancy?.tenantId).toBe(flat!.currentTenantId);
  });

  it('updates a flat’s baseRate', async () => {
    const flat = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '401',
      baseRate: 1500,
      ownerName: 'Owner D',
      ownerEmail: `flat-d-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat!.id);

    const updated = await updateFlat(flat!.id, societyId, { baseRate: 1750 });
    expect(Number(updated?.baseRate)).toBe(1750);
  });

  it('updates the owner’s contact info in place', async () => {
    const flat = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '402',
      baseRate: 1500,
      ownerName: 'Owner D2',
      ownerEmail: `flat-d2-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat!.id);

    const updated = await updateFlat(flat!.id, societyId, { ownerPhone: '+919000000042' });
    expect(updated?.owner.phone).toBe('+919000000042');
  });

  it('returns null updating a flat scoped to a different society (tenant scoping)', async () => {
    const flat = await createFlat({
      societyId,
      wing: 'D',
      flatNumber: '403',
      baseRate: 1500,
      ownerName: 'Owner D3',
      ownerEmail: `flat-d3-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat!.id);

    const result = await updateFlat(flat!.id, otherSocietyId, { baseRate: 1999 });
    expect(result).toBeNull();

    const stored = await prisma.flat.findUniqueOrThrow({ where: { id: flat!.id } });
    expect(Number(stored.baseRate)).toBe(1500);
  });

  it('assigns and then removes a tenant via occupancy on update', async () => {
    const flat = await createFlat({
      societyId,
      wing: 'E',
      flatNumber: '501',
      baseRate: 1500,
      ownerName: 'Owner E',
      ownerEmail: `flat-e-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat!.id);

    const withTenant = await updateFlat(flat!.id, societyId, {
      occupancy: 'tenant',
      tenantName: 'Update Tenant',
      tenantEmail: `flat-e-tenant-${suffix}@example.com`,
    });
    expect(withTenant?.currentTenant?.email).toBe(`flat-e-tenant-${suffix}@example.com`);

    const backToOwner = await updateFlat(flat!.id, societyId, { occupancy: 'owner' });
    expect(backToOwner?.currentTenantId).toBeNull();
  });

  it('returns null updating a nonexistent flat', async () => {
    const result = await updateFlat('nonexistent-id', societyId, { baseRate: 1000 });
    expect(result).toBeNull();
  });
});
