import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin-users.service';
import { createFlat } from '../../../../src/features/flats/admin/onboarding.service';
import {
  assignTenant,
  InvalidTenantError,
  NoCurrentTenantError,
  removeTenant,
  TenantAlreadyAssignedError,
} from '../../../../src/features/flats/admin/tenancy.service';

// Unlike tests/features/flats-tenant.test.ts, this calls the service directly — no
// HTTP (see tests/features/admin-users.service.test.ts for the same rationale).
describe('flats service — tenant assignment', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerId: string;
  let tenantId: string;
  let otherSocietyTenantId: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Test St', upiVpa: 'other@okhdfcbank' },
    });
    otherSocietyId = otherSociety.id;

    const owner = await createUser({
      name: 'Test Owner',
      email: `tenant-owner-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerId = owner.id;

    const tenant = await createUser({
      name: 'Test Tenant',
      email: `tenant-tenant-${suffix}@example.com`,
      password: 'password-123',
      role: 'TENANT',
      societyId,
    });
    createdUserIds.push(tenant.id);
    tenantId = tenant.id;

    const otherTenant = await createUser({
      name: 'Other Society Tenant',
      email: `tenant-other-${suffix}@example.com`,
      password: 'password-123',
      role: 'TENANT',
      societyId: otherSocietyId,
    });
    createdUserIds.push(otherTenant.id);
    otherSocietyTenantId = otherTenant.id;
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
    await prisma.$disconnect();
  });

  // A fresh, owner-occupied flat before every test — assignment tests need a clean
  // starting state, and removal tests build on top of assignTenant within the test.
  beforeEach(async () => {
    const flat = await createFlat({
      societyId,
      wing: 'A',
      flatNumber: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      baseRate: 1500,
      ownerName: 'Test Owner',
      ownerEmail: `tenant-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat.id);
    flatId = flat.id;
  });

  it('assigns a tenant: opens an OccupancyChange row and sets Flat.currentTenantId', async () => {
    const flat = await assignTenant(flatId, societyId, tenantId);
    expect(flat?.currentTenantId).toBe(tenantId);

    const occupancy = await prisma.occupancyChange.findFirst({
      where: { flatId, effectiveEnd: null },
    });
    expect(occupancy).not.toBeNull();
    expect(occupancy?.tenantId).toBe(tenantId);
  });

  it('throws InvalidTenantError when tenantId does not exist', async () => {
    await expect(assignTenant(flatId, societyId, 'nonexistent-id')).rejects.toBeInstanceOf(
      InvalidTenantError,
    );
  });

  it('throws InvalidTenantError when tenantId belongs to a different society', async () => {
    await expect(assignTenant(flatId, societyId, otherSocietyTenantId)).rejects.toBeInstanceOf(
      InvalidTenantError,
    );
  });

  it('throws InvalidTenantError when tenantId references a non-TENANT user (e.g. the owner)', async () => {
    await expect(assignTenant(flatId, societyId, ownerId)).rejects.toBeInstanceOf(
      InvalidTenantError,
    );
  });

  it('throws TenantAlreadyAssignedError when the flat already has a current tenant', async () => {
    await assignTenant(flatId, societyId, tenantId);
    await expect(assignTenant(flatId, societyId, tenantId)).rejects.toBeInstanceOf(
      TenantAlreadyAssignedError,
    );
  });

  it('returns null assigning a tenant to a flat scoped to a different society', async () => {
    const result = await assignTenant(flatId, otherSocietyId, tenantId);
    expect(result).toBeNull();
  });

  it('removes a tenant: closes the open OccupancyChange row and clears Flat.currentTenantId', async () => {
    await assignTenant(flatId, societyId, tenantId);

    const flat = await removeTenant(flatId, societyId);
    expect(flat?.currentTenantId).toBeNull();

    const occupancy = await prisma.occupancyChange.findFirst({ where: { flatId, tenantId } });
    expect(occupancy?.effectiveEnd).not.toBeNull();
  });

  it('throws NoCurrentTenantError removing a tenant from an owner-occupied flat', async () => {
    await expect(removeTenant(flatId, societyId)).rejects.toBeInstanceOf(NoCurrentTenantError);
  });

  it('returns null removing a tenant from a flat scoped to a different society', async () => {
    await assignTenant(flatId, societyId, tenantId);
    const result = await removeTenant(flatId, otherSocietyId);
    expect(result).toBeNull();
  });

  it('allows re-assigning a (possibly different) tenant after removal', async () => {
    await assignTenant(flatId, societyId, tenantId);
    await removeTenant(flatId, societyId);

    const flat = await assignTenant(flatId, societyId, tenantId);
    expect(flat?.currentTenantId).toBe(tenantId);

    const openRows = await prisma.occupancyChange.findMany({
      where: { flatId, effectiveEnd: null },
    });
    expect(openRows).toHaveLength(1);
  });
});
