// Resident self-service: getMyFlat, upsertOwnTenant, removeOwnTenant.
// Ownership-scoped (req.user.id), not role-scoped like the admin equivalents.
import { randomBytes } from 'crypto';
import { prisma } from '../../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../../shared/errors/prisma-errors';
import { scopedWhere } from '../../../shared/security/tenant-scope';
import { createUser } from '../../users/admin/admin-users-service';
import { requestPasswordReset } from '../../auth/auth.service';
import {
  ConflictingRoleError,
  FLAT_WITH_RESIDENTS_INCLUDE,
  NoCurrentTenantError,
} from '../flat-shared';
import { updateFlat } from '../admin/admin-flats-onboarding-service';

export { updateFlat, ConflictingRoleError, NoCurrentTenantError };

// A resident's "my flat" view. Assumes at most one flat per resident — if a User
// somehow owns more than one, returns the earliest-created one.
export async function getMyFlat(userId: string, societyId: string, role: 'OWNER' | 'TENANT') {
  const flat = await prisma.flat.findFirst({
    where: scopedWhere(
      societyId,
      role === 'OWNER' ? { ownerId: userId } : { currentTenantId: userId },
    ),
    orderBy: { createdAt: 'asc' },
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
  if (!flat) return null;

  const occupancy = flat.currentTenantId
    ? await prisma.occupancyChange.findFirst({ where: { flatId: flat.id, effectiveEnd: null } })
    : null;

  return { ...flat, occupancyEffectiveFrom: occupancy?.effectiveStart ?? null };
}

// Returns null (→ 404) for a flat that doesn't exist, belongs to a different
// society, or isn't the caller's own.
async function getOwnFlat(flatId: string, societyId: string, ownerId: string) {
  return prisma.flat.findFirst({ where: scopedWhere(societyId, { id: flatId, ownerId }) });
}

export interface UpsertOwnTenantInput {
  name: string;
  phone?: string;
  email: string;
  effectiveFrom?: Date;
}

// Unlike the admin assignTenant (which rejects if a tenant already exists), this
// updates the existing tenant's contact info in place.
export async function upsertOwnTenant(
  flatId: string,
  societyId: string,
  ownerId: string,
  input: UpsertOwnTenantInput,
) {
  const flat = await getOwnFlat(flatId, societyId, ownerId);
  if (!flat) return null;

  const openOccupancy = await prisma.occupancyChange.findFirst({
    where: { flatId, effectiveEnd: null },
  });

  if (openOccupancy) {
    try {
      await prisma.user.update({
        where: { id: openOccupancy.tenantId },
        data: { name: input.name, phone: input.phone, email: input.email },
      });
    } catch (err) {
      const fields = getUniqueConstraintFields(err);
      if (fields) throw new DuplicateFieldError(fields);
      throw err;
    }
    if (input.effectiveFrom) {
      await prisma.occupancyChange.update({
        where: { id: openOccupancy.id },
        data: { effectiveStart: input.effectiveFrom },
      });
    }
  } else {
    // Created with a random unusable password, then a password-reset email to set
    // their own. createUser's DuplicateFieldError (email in use) propagates as-is.
    const tenant = await createUser({
      name: input.name,
      phone: input.phone,
      email: input.email,
      password: randomBytes(24).toString('hex'),
      role: 'TENANT',
      societyId,
    });
    await requestPasswordReset(tenant.email);

    await prisma.$transaction([
      prisma.occupancyChange.create({
        data: {
          flatId,
          tenantId: tenant.id,
          effectiveStart: input.effectiveFrom ?? new Date(),
          effectiveEnd: null,
        },
      }),
      prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: tenant.id } }),
    ]);
  }

  return prisma.flat.findFirst({
    where: scopedWhere(societyId, { id: flatId, ownerId }),
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

export async function removeOwnTenant(flatId: string, societyId: string, ownerId: string) {
  const flat = await getOwnFlat(flatId, societyId, ownerId);
  if (!flat) return null;

  const openOccupancy = await prisma.occupancyChange.findFirst({
    where: { flatId, effectiveEnd: null },
  });
  if (!openOccupancy) throw new NoCurrentTenantError();

  const now = new Date();
  const [, updatedFlat] = await prisma.$transaction([
    prisma.occupancyChange.update({ where: { id: openOccupancy.id }, data: { effectiveEnd: now } }),
    prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: null } }),
    // Vehicle Finder (docs/features/vehicle-finder/): a departed tenant's vehicles
    // must stop surfacing against a flat they no longer occupy.
    prisma.vehicle.deleteMany({ where: { userId: openOccupancy.tenantId } }),
  ]);
  return updatedFlat;
}
