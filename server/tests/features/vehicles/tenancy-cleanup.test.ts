import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { registerVehicle } from '../../../src/features/vehicles/resident/resident-vehicles.service';
import { removeOwnTenant } from '../../../src/features/flats/resident/resident-flats-service';
import { removeTenant } from '../../../src/features/flats/admin/admin-flats-tenancy-service';
import { updateFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';

describe('Vehicle cleanup on tenancy end', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const societyIds: string[] = [];

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { societyId: { in: societyIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flat: { societyId: { in: societyIds } } } });
    await prisma.flat.deleteMany({ where: { societyId: { in: societyIds } } });
    await prisma.user.deleteMany({ where: { societyId: { in: societyIds } } });
    await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  });

  async function setupOccupiedFlat(label: string) {
    const society = await prisma.society.create({
      data: { name: `Tenancy Cleanup ${label} ${suffix}`, address: '1 Test St' },
    });
    societyIds.push(society.id);

    const owner = await prisma.user.create({
      data: {
        name: `${label} Owner`,
        email: `${label}-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId: society.id,
      },
    });
    const tenant = await prisma.user.create({
      data: {
        name: `${label} Tenant`,
        email: `${label}-tenant-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'TENANT',
        societyId: society.id,
      },
    });
    const flat = await prisma.flat.create({
      data: {
        wing: 'C',
        flatNumber: `${label}-${suffix}`,
        baseRate: 1000,
        societyId: society.id,
        ownerId: owner.id,
        currentTenantId: tenant.id,
      },
    });
    await prisma.occupancyChange.create({
      data: { flatId: flat.id, tenantId: tenant.id, effectiveStart: new Date(), effectiveEnd: null },
    });

    return { societyId: society.id, flatId: flat.id, ownerId: owner.id, tenantId: tenant.id };
  }

  it('removeOwnTenant (resident self-service) deletes the departing tenant\'s vehicles', async () => {
    const { societyId: sId, flatId, ownerId, tenantId } = await setupOccupiedFlat('resident');

    const vehicle = await registerVehicle(sId, tenantId, {
      plateNumber: `MH70TC${suffix.slice(-4)}`,
      type: 'TWO_WHEELER',
    });

    await removeOwnTenant(flatId, sId, ownerId);

    const stillExists = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(stillExists).toBeNull();
  });

  it('removeTenant (admin) deletes the departing tenant\'s vehicles', async () => {
    const { societyId: sId, flatId, tenantId } = await setupOccupiedFlat('admin');

    const vehicle = await registerVehicle(sId, tenantId, {
      plateNumber: `MH80TC${suffix.slice(-4)}`,
      type: 'FOUR_WHEELER',
    });

    await removeTenant(flatId, sId);

    const stillExists = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(stillExists).toBeNull();
  });

  it('updateFlat reverting occupancy to owner-occupied deletes the departing tenant\'s vehicles', async () => {
    const { societyId: sId, flatId, tenantId } = await setupOccupiedFlat('combined-form');

    const vehicle = await registerVehicle(sId, tenantId, {
      plateNumber: `MH90TC${suffix.slice(-4)}`,
      type: 'TWO_WHEELER',
    });

    await updateFlat(flatId, sId, { occupancy: 'owner' });

    const stillExists = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(stillExists).toBeNull();
  });
});
