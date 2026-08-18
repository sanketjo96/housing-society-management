// Resident self-service (CLAUDE.md's "Addition (2026-08-06)"): getMyFlat,
// upsertOwnTenant, removeOwnTenant. Ownership-scoped, not admin-role-scoped — distinct
// from admin/tenancy.service.ts's assignTenant/removeTenant, which stay admin-only and
// unchanged. Backs resident/controller.ts, whose handlers pass req.user.id as the
// owner/tenant identity, never a role check alone.
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

// Re-exported so resident/controller.ts can pull everything it needs (including the
// shared updateFlat/ConflictingRoleError) from this one module — the same "combined
// Save button" endpoint (PUT /api/me/flat) reuses updateFlat's exact
// find-or-create-tenant-inline mechanism rather than duplicating it (CLAUDE.md's
// "Pivot (2026-08-06): resident view moves to a transaction ledger").
export { updateFlat, ConflictingRoleError, NoCurrentTenantError };

// A resident's "my flat" view: for an OWNER, the flat they own; for a TENANT, the
// flat they currently occupy. This MVP assumes at most one such flat per resident
// (matches the shared UI mockup, which has a single hardcoded flat per session) —
// if a User somehow owns more than one Flat, this returns the earliest-created one,
// not an error; multi-flat ownership isn't a modeled concept anywhere else in the app.
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

// Scoped to req.user.id === flat.ownerId, not requireRole(['ADMIN']) — an owner acting
// on their own flat, not an admin acting on any flat. Returns null (→ 404) for a flat
// that doesn't exist, belongs to a different society, or isn't the caller's own —
// same non-enumeration reasoning as every other scoping check in this feature.
async function getOwnFlat(flatId: string, societyId: string, ownerId: string) {
  return prisma.flat.findFirst({ where: scopedWhere(societyId, { id: flatId, ownerId }) });
}

export interface UpsertOwnTenantInput {
  name: string;
  phone?: string;
  email: string;
  effectiveFrom?: Date;
}

// Deliberately diverges from assignTenant's behavior: where the admin endpoint throws
// TenantAlreadyAssignedError and requires an explicit removeTenant first, this updates
// the existing tenant's contact info in place when the flat already has one — matches
// the resident UI's single "Save changes" button over one form (occupancy toggle +
// tenant fields together), not a two-step admin workflow. See CLAUDE.md's "Addition
// (2026-08-06)" for the full reasoning.
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
    // No password field is ever collected from the owner — a real, login-capable
    // TENANT is created with a random unusable password, then handed the same
    // password-reset mechanism Task 2.4 already built (docs/auth.md) so they can set
    // their own real password. createUser throws DuplicateFieldError itself if the
    // email's already in use — deliberately not caught here, so it propagates as-is.
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

// Same underlying mechanism as admin/tenancy.service.ts's removeTenant,
// ownership-scoped instead of role-scoped.
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
  ]);
  return updatedFlat;
}
