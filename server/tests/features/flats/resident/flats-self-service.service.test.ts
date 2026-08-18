import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { createUser } from '../../../../src/features/users/admin-users.service';
import { createFlat } from '../../../../src/features/flats/admin/onboarding.service';
import {
  getMyFlat,
  NoCurrentTenantError,
  removeOwnTenant,
  upsertOwnTenant,
} from '../../../../src/features/flats/resident/service';

describe('flats service — resident self-service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let otherOwnerId: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const owner = await createUser({
      name: 'Self-Service Owner',
      email: `ss-owner-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerId = owner.id;

    const otherOwner = await createUser({
      name: 'Other Owner',
      email: `ss-other-owner-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(otherOwner.id);
    otherOwnerId = otherOwner.id;
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // ownerName/ownerEmail (not ownerId) — findOrCreateUserByEmail resolves this back
    // to the already-created "Self-Service Owner" account (matching email), so
    // `ownerId` above stays valid for the rest of this suite's assertions.
    const flat = await createFlat({
      societyId,
      wing: 'S',
      flatNumber: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      baseRate: 1500,
      ownerName: 'Self-Service Owner',
      ownerEmail: `ss-owner-${suffix}@example.com`,
    });
    createdFlatIds.push(flat!.id);
    flatId = flat!.id;
  });

  describe('getMyFlat', () => {
    it('finds the flat an OWNER owns', async () => {
      const flat = await getMyFlat(ownerId, societyId, 'OWNER');
      expect(flat?.id).toBe(flatId);
    });

    it('returns null for an OWNER with no flat', async () => {
      const flat = await getMyFlat(otherOwnerId, societyId, 'OWNER');
      expect(flat).toBeNull();
    });

    it('finds the flat a TENANT currently occupies', async () => {
      const created = await upsertOwnTenant(flatId, societyId, ownerId, {
        name: 'Tenant One',
        email: `ss-tenant-${suffix}@example.com`,
      });
      createdUserIds.push(created!.currentTenantId!);
      const flat = await getMyFlat(created!.currentTenantId!, societyId, 'TENANT');
      expect(flat?.id).toBe(flatId);
    });
  });

  describe('upsertOwnTenant', () => {
    it('creates a new tenant with a working password-reset token when the flat has none', async () => {
      const email = `ss-new-tenant-${suffix}@example.com`;
      const flat = await upsertOwnTenant(flatId, societyId, ownerId, { name: 'New Tenant', email });

      expect(flat?.currentTenant?.email).toBe(email);

      const tenantUser = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(tenantUser.role).toBe('TENANT');
      createdUserIds.push(tenantUser.id);

      const resetToken = await prisma.passwordResetToken.findFirst({
        where: { userId: tenantUser.id },
      });
      expect(resetToken).not.toBeNull();

      const occupancy = await prisma.occupancyChange.findFirst({
        where: { flatId, effectiveEnd: null },
      });
      expect(occupancy?.tenantId).toBe(tenantUser.id);
    });

    it('updates the existing tenant’s contact info in place, without rejecting re-assignment', async () => {
      const email = `ss-tenant-a-${suffix}@example.com`;
      const first = await upsertOwnTenant(flatId, societyId, ownerId, { name: 'Tenant A', email });
      createdUserIds.push(first!.currentTenantId!);

      const updated = await upsertOwnTenant(flatId, societyId, ownerId, {
        name: 'Tenant A Updated',
        email,
      });
      expect(updated?.currentTenantId).toBe(first?.currentTenantId);
      expect(updated?.currentTenant?.name).toBe('Tenant A Updated');

      const openRows = await prisma.occupancyChange.findMany({
        where: { flatId, effectiveEnd: null },
      });
      expect(openRows).toHaveLength(1);
    });

    it('returns null for a flat the caller does not own', async () => {
      const result = await upsertOwnTenant(flatId, societyId, otherOwnerId, {
        name: 'Someone',
        email: `ss-nope-${suffix}@example.com`,
      });
      expect(result).toBeNull();
    });
  });

  describe('removeOwnTenant', () => {
    it('closes the open occupancy and clears currentTenantId', async () => {
      const created = await upsertOwnTenant(flatId, societyId, ownerId, {
        name: 'Departing Tenant',
        email: `ss-departing-${suffix}@example.com`,
      });
      createdUserIds.push(created!.currentTenantId!);

      const removed = await removeOwnTenant(flatId, societyId, ownerId);
      expect(removed?.currentTenantId).toBeNull();
    });

    it('throws NoCurrentTenantError for an owner-occupied flat', async () => {
      await expect(removeOwnTenant(flatId, societyId, ownerId)).rejects.toBeInstanceOf(
        NoCurrentTenantError,
      );
    });

    it('returns null for a flat the caller does not own', async () => {
      const result = await removeOwnTenant(flatId, societyId, otherOwnerId);
      expect(result).toBeNull();
    });
  });
});
