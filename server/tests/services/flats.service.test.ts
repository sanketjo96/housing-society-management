import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DuplicateFieldError } from '../../src/lib/errors';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { createFlat, InvalidOwnerError, updateFlat } from '../../src/services/flats.service';

// Unlike tests/routes/flats.test.ts, this calls the service directly — no HTTP, no
// supertest (see tests/services/admin-users.service.test.ts for the same rationale).
describe('flats service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerId: string;
  let otherSocietyOwnerId: string;
  let tenantId: string;
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

    const owner = await createUser({
      name: 'Test Owner',
      email: `flat-owner-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerId = owner.id;

    const otherOwner = await createUser({
      name: 'Other Society Owner',
      email: `flat-other-owner-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId: otherSocietyId,
    });
    createdUserIds.push(otherOwner.id);
    otherSocietyOwnerId = otherOwner.id;

    const tenant = await createUser({
      name: 'Test Tenant',
      email: `flat-tenant-${suffix}@example.com`,
      password: 'password-123',
      role: 'TENANT',
      societyId,
    });
    createdUserIds.push(tenant.id);
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
    await prisma.$disconnect();
  });

  it('creates a flat with a valid owner', async () => {
    const flat = await createFlat({ societyId, block: 'A', flatNumber: '101', baseRate: 1500, ownerId });
    createdFlatIds.push(flat.id);

    expect(flat.block).toBe('A');
    expect(flat.flatNumber).toBe('101');
    expect(flat.ownerId).toBe(ownerId);
    expect(Number(flat.baseRate)).toBe(1500);
  });

  it('throws InvalidOwnerError when ownerId does not exist at all', async () => {
    await expect(
      createFlat({ societyId, block: 'A', flatNumber: '102', baseRate: 1500, ownerId: 'nonexistent-id' }),
    ).rejects.toBeInstanceOf(InvalidOwnerError);
  });

  it('throws InvalidOwnerError when ownerId belongs to a different society', async () => {
    await expect(
      createFlat({ societyId, block: 'A', flatNumber: '103', baseRate: 1500, ownerId: otherSocietyOwnerId }),
    ).rejects.toBeInstanceOf(InvalidOwnerError);
  });

  it('throws InvalidOwnerError when ownerId references a non-OWNER user (e.g. a tenant)', async () => {
    await expect(
      createFlat({ societyId, block: 'A', flatNumber: '104', baseRate: 1500, ownerId: tenantId }),
    ).rejects.toBeInstanceOf(InvalidOwnerError);
  });

  it('throws DuplicateFieldError for a duplicate block+flatNumber within the same society', async () => {
    const first = await createFlat({ societyId, block: 'B', flatNumber: '201', baseRate: 1500, ownerId });
    createdFlatIds.push(first.id);

    await expect(
      createFlat({ societyId, block: 'B', flatNumber: '201', baseRate: 1600, ownerId }),
    ).rejects.toBeInstanceOf(DuplicateFieldError);
  });

  it('allows the same block+flatNumber combination across two different societies', async () => {
    const flat = await createFlat({
      societyId: otherSocietyId,
      block: 'B',
      flatNumber: '201',
      baseRate: 1500,
      ownerId: otherSocietyOwnerId,
    });
    createdFlatIds.push(flat.id);
    expect(flat.block).toBe('B');
  });

  it('updates a flat’s baseRate', async () => {
    const flat = await createFlat({ societyId, block: 'C', flatNumber: '301', baseRate: 1500, ownerId });
    createdFlatIds.push(flat.id);

    const updated = await updateFlat(flat.id, societyId, { baseRate: 1750 });
    expect(Number(updated?.baseRate)).toBe(1750);
  });

  it('returns null updating a flat scoped to a different society (tenant scoping)', async () => {
    const flat = await createFlat({ societyId, block: 'D', flatNumber: '401', baseRate: 1500, ownerId });
    createdFlatIds.push(flat.id);

    const result = await updateFlat(flat.id, otherSocietyId, { baseRate: 1999 });
    expect(result).toBeNull();

    const stored = await prisma.flat.findUniqueOrThrow({ where: { id: flat.id } });
    expect(Number(stored.baseRate)).toBe(1500);
  });

  it('rejects an update that sets an invalid ownerId', async () => {
    const flat = await createFlat({ societyId, block: 'E', flatNumber: '501', baseRate: 1500, ownerId });
    createdFlatIds.push(flat.id);

    await expect(updateFlat(flat.id, societyId, { ownerId: tenantId })).rejects.toBeInstanceOf(InvalidOwnerError);
  });

  it('returns null updating a nonexistent flat', async () => {
    const result = await updateFlat('nonexistent-id', societyId, { baseRate: 1000 });
    expect(result).toBeNull();
  });
});
