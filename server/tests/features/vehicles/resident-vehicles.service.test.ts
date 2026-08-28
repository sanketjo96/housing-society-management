import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { DuplicateFieldError } from '../../../src/shared/errors/errors';
import {
  deleteMyVehicle,
  listMyVehicles,
  registerVehicle,
  VehicleNotFoundError,
} from '../../../src/features/vehicles/resident/resident-vehicles.service';

describe('resident-vehicles service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let residentId: string;
  let otherResidentId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Vehicles Test Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Vehicles Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;

    const resident = await prisma.user.create({
      data: {
        name: 'Vehicle Resident',
        email: `vehicle-resident-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    residentId = resident.id;

    const otherResident = await prisma.user.create({
      data: {
        name: 'Other Resident',
        email: `other-resident-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    otherResidentId = otherResident.id;
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.user.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
  });

  it('registers a vehicle and lists it', async () => {
    const vehicle = await registerVehicle(societyId, residentId, {
      plateNumber: `MH12AB${suffix.slice(-4)}`,
      type: 'FOUR_WHEELER',
    });

    const list = await listMyVehicles(societyId, residentId);
    expect(list.map((v) => v.id)).toContain(vehicle.id);
  });

  it('allows a resident to register more than one vehicle', async () => {
    await registerVehicle(societyId, residentId, {
      plateNumber: `MH14CD${suffix.slice(-4)}`,
      type: 'TWO_WHEELER',
    });
    await registerVehicle(societyId, residentId, {
      plateNumber: `MH14EF${suffix.slice(-4)}`,
      type: 'TWO_WHEELER',
    });

    const list = await listMyVehicles(societyId, residentId);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('normalizes the plate on write — a spaced/lowercase variant collides with the canonical value', async () => {
    const plate = `MH20ZZ${suffix.slice(-4)}`;
    await registerVehicle(societyId, residentId, { plateNumber: plate, type: 'FOUR_WHEELER' });

    await expect(
      registerVehicle(societyId, otherResidentId, {
        plateNumber: `mh-20-zz-${suffix.slice(-4)}`,
        type: 'FOUR_WHEELER',
      }),
    ).rejects.toThrow(DuplicateFieldError);
  });

  it('rejects a duplicate plate within the same society, even for a different resident', async () => {
    const plate = `MH30YY${suffix.slice(-4)}`;
    await registerVehicle(societyId, residentId, { plateNumber: plate, type: 'FOUR_WHEELER' });

    await expect(
      registerVehicle(societyId, otherResidentId, { plateNumber: plate, type: 'FOUR_WHEELER' }),
    ).rejects.toThrow(DuplicateFieldError);
  });

  it('allows the same plate text in a different society', async () => {
    const plate = `MH40XX${suffix.slice(-4)}`;
    await registerVehicle(societyId, residentId, { plateNumber: plate, type: 'FOUR_WHEELER' });

    const otherResidentInOtherSociety = await prisma.user.create({
      data: {
        name: 'Cross Society Resident',
        email: `cross-society-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId: otherSocietyId,
      },
    });

    await expect(
      registerVehicle(otherSocietyId, otherResidentInOtherSociety.id, {
        plateNumber: plate,
        type: 'FOUR_WHEELER',
      }),
    ).resolves.toBeTruthy();
  });

  it('deletes a vehicle the caller owns', async () => {
    const vehicle = await registerVehicle(societyId, residentId, {
      plateNumber: `MH50WW${suffix.slice(-4)}`,
      type: 'TWO_WHEELER',
    });

    await deleteMyVehicle(vehicle.id, societyId, residentId);

    const stillExists = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(stillExists).toBeNull();
  });

  it('refuses to delete another resident\'s vehicle', async () => {
    const vehicle = await registerVehicle(societyId, residentId, {
      plateNumber: `MH60VV${suffix.slice(-4)}`,
      type: 'TWO_WHEELER',
    });

    await expect(deleteMyVehicle(vehicle.id, societyId, otherResidentId)).rejects.toThrow(
      VehicleNotFoundError,
    );

    const stillExists = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
    expect(stillExists).not.toBeNull();
  });

  it('deleting a nonexistent vehicle id throws VehicleNotFoundError', async () => {
    await expect(deleteMyVehicle('does-not-exist', societyId, residentId)).rejects.toThrow(
      VehicleNotFoundError,
    );
  });
});
