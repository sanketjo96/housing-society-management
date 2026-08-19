import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { DuplicateFieldError } from '../../../src/shared/errors/errors';
import {
  createFeeType,
  FeeTypeNotFoundError,
  listFeeTypes,
  updateFeeType,
} from '../../../src/features/fee-types/fee-types.service';

describe('fee-types service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let adminId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Fee Types Test Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;

    const admin = await prisma.user.create({
      data: {
        name: 'Fee Types Admin',
        email: `fee-types-admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.feeType.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.user.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
  });

  it('creates a fee type and lists it', async () => {
    const feeType = await createFeeType(societyId, adminId, { name: `Transfer Fee ${suffix}` });
    expect(feeType.isActive).toBe(true);

    const list = await listFeeTypes(societyId);
    expect(list.map((f) => f.id)).toContain(feeType.id);
  });

  it('writes an audit log entry on create', async () => {
    const feeType = await createFeeType(societyId, adminId, { name: `Joining Fee ${suffix}` });
    const log = await prisma.auditLog.findFirst({
      where: { entityId: feeType.id, entityType: 'FeeType' },
    });
    expect(log?.action).toBe('CREATE_FEE_TYPE');
    expect(log?.actorId).toBe(adminId);
  });

  it('rejects a duplicate name within the same society', async () => {
    const name = `Fine ${suffix}`;
    await createFeeType(societyId, adminId, { name });
    await expect(createFeeType(societyId, adminId, { name })).rejects.toThrow(DuplicateFieldError);
  });

  it('allows the same name in a different society', async () => {
    const name = `Common Name ${suffix}`;
    await createFeeType(societyId, adminId, { name });
    await expect(createFeeType(otherSocietyId, adminId, { name })).resolves.toBeTruthy();
  });

  it('listFeeTypes excludes inactive by default, includes with includeInactive', async () => {
    const feeType = await createFeeType(societyId, adminId, { name: `NOC Fee ${suffix}` });
    await updateFeeType(feeType.id, societyId, adminId, { isActive: false });

    const activeOnly = await listFeeTypes(societyId);
    expect(activeOnly.map((f) => f.id)).not.toContain(feeType.id);

    const all = await listFeeTypes(societyId, true);
    expect(all.map((f) => f.id)).toContain(feeType.id);
  });

  it('updateFeeType can rename and deactivate — never hard-deletes', async () => {
    const feeType = await createFeeType(societyId, adminId, { name: `Late Fee ${suffix}` });
    const updated = await updateFeeType(feeType.id, societyId, adminId, {
      name: `Renamed Late Fee ${suffix}`,
      isActive: false,
    });
    expect(updated.name).toBe(`Renamed Late Fee ${suffix}`);
    expect(updated.isActive).toBe(false);

    // Still exists as a real row — soft-deleted, not gone.
    const stillExists = await prisma.feeType.findUnique({ where: { id: feeType.id } });
    expect(stillExists).not.toBeNull();
  });

  it('writes a distinct audit action on update', async () => {
    const feeType = await createFeeType(societyId, adminId, { name: `Audit Fee ${suffix}` });
    await updateFeeType(feeType.id, societyId, adminId, { description: 'updated' });
    const log = await prisma.auditLog.findFirst({
      where: { entityId: feeType.id, entityType: 'FeeType', action: 'UPDATE_FEE_TYPE' },
    });
    expect(log).not.toBeNull();
  });

  it('rejects updating a fee type that belongs to a different society', async () => {
    const feeType = await createFeeType(otherSocietyId, adminId, { name: `Cross-Society Fee ${suffix}` });
    await expect(updateFeeType(feeType.id, societyId, adminId, { name: 'hijacked' })).rejects.toThrow(
      FeeTypeNotFoundError,
    );
  });
});
