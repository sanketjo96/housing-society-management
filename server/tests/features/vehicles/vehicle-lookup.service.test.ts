import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { registerVehicle } from '../../../src/features/vehicles/resident/resident-vehicles.service';
import { searchVehicle } from '../../../src/features/vehicles/lookup/vehicle-lookup.service';

describe('vehicle-lookup service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Lookup Test Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Lookup Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Lookup Owner',
        email: `lookup-owner-${suffix}@example.com`,
        phone: `9${suffix.replace(/\D/g, '').slice(0, 9)}`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    const flat = await prisma.flat.create({
      data: {
        wing: 'B',
        flatNumber: `202-${suffix}`,
        baseRate: 1500,
        societyId,
        ownerId: owner.id,
      },
    });
    flatId = flat.id;
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.flat.deleteMany({ where: { id: flatId } });
    await prisma.user.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
  });

  it('returns the correct flat/name/phone on a match', async () => {
    const plate = `MH01LK${suffix.slice(-4)}`;
    await registerVehicle(societyId, ownerId, { plateNumber: plate, type: 'FOUR_WHEELER' });

    const result = await searchVehicle(societyId, plate);
    expect(result).toEqual({
      found: true,
      wing: 'B',
      flatNumber: `202-${suffix}`,
      occupantName: 'Lookup Owner',
      occupantPhone: expect.any(String),
    });
  });

  it('matches regardless of how the searched plate is formatted', async () => {
    const plate = `MH02LK${suffix.slice(-4)}`;
    await registerVehicle(societyId, ownerId, { plateNumber: plate, type: 'TWO_WHEELER' });

    const result = await searchVehicle(societyId, `mh-02-lk-${suffix.slice(-4)}`);
    expect(result.found).toBe(true);
  });

  it('returns found:false for an unregistered plate', async () => {
    const result = await searchVehicle(societyId, `NOSUCHPLATE${suffix.slice(-4)}`);
    expect(result).toEqual({ found: false });
  });

  it('returns found:false for a plate registered in a different society', async () => {
    const otherOwner = await prisma.user.create({
      data: {
        name: 'Other Society Owner',
        email: `other-society-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId: otherSocietyId,
      },
    });
    const plate = `MH03LK${suffix.slice(-4)}`;
    await registerVehicle(otherSocietyId, otherOwner.id, { plateNumber: plate, type: 'FOUR_WHEELER' });

    const result = await searchVehicle(societyId, plate);
    expect(result).toEqual({ found: false });
  });

  // Scoped by this test file's own unique actor/entity ids, not a bare global
  // count() — other test files run concurrently against the same shared test
  // database and legitimately create/delete their own AuditLog rows, so a
  // global count is racy. Scoping to ids unique to this run isolates the
  // assertion from that unrelated activity.
  it('writes no AuditLog row on a hit', async () => {
    const plate = `MH04LK${suffix.slice(-4)}`;
    await registerVehicle(societyId, ownerId, { plateNumber: plate, type: 'FOUR_WHEELER' });

    const before = await prisma.auditLog.count({ where: { actorId: ownerId } });
    await searchVehicle(societyId, plate);
    const after = await prisma.auditLog.count({ where: { actorId: ownerId } });

    expect(after).toBe(before);
    expect(after).toBe(0);
  });

  it('writes no AuditLog row on a miss', async () => {
    const before = await prisma.auditLog.count({ where: { actorId: ownerId } });
    await searchVehicle(societyId, `DEFINITELYNOTREGISTERED${suffix.slice(-4)}`);
    const after = await prisma.auditLog.count({ where: { actorId: ownerId } });

    expect(after).toBe(before);
    expect(after).toBe(0);
  });
});
