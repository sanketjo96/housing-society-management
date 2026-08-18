// Internals shared across flats/admin and flats/resident — the find-or-create-account
// mechanism, the occupancy-apply transaction, and the handful of errors more than one
// side needs to throw. Not imported by any controller directly; each concern's own
// service module re-exports whichever of these its own callers need.
import { randomBytes } from 'crypto';
import type { Role } from '../../infrastructure/prisma/generated/client';
import { prisma } from '../../infrastructure/prisma/client';
import { scopedWhere } from '../../shared/security/tenant-scope';
import { createUser } from '../users/admin/admin-users-service';
import { requestPasswordReset } from '../auth/auth.service';

// Thrown when an email supplied for an owner/tenant contact field already belongs to a
// User in this society, but under a different role — e.g. onboarding someone as a flat
// owner whose email is already registered as a TENANT (or ADMIN) elsewhere. One email
// can't wear two roles in this schema, so this is a real conflict, not silently
// resolvable by picking one.
export class ConflictingRoleError extends Error {
  constructor(email: string, expectedRole: Role, actualRole: Role) {
    super(
      `${email} already exists as ${actualRole} in this society, cannot also be ${expectedRole}`,
    );
    this.name = 'ConflictingRoleError';
  }
}

// Shared between admin/tenancy.service.ts's removeTenant and resident/service.ts's
// removeOwnTenant — both close an OccupancyChange row via the same underlying
// mechanism.
export class NoCurrentTenantError extends Error {
  constructor() {
    super('Flat has no current tenant to remove');
    this.name = 'NoCurrentTenantError';
  }
}

interface ContactFields {
  name: string;
  phone?: string;
  email: string;
}

export const FLAT_WITH_RESIDENTS_INCLUDE = {
  owner: { select: { id: true, name: true, email: true, phone: true } },
  currentTenant: { select: { id: true, name: true, email: true, phone: true } },
} as const;

// Scoped to the caller's own society (Task 2.6), same as admin-users-service.ts's
// getUserById — a flat id from a different society returns null, indistinguishable
// from an id that doesn't exist at all.
export async function getFlatById(id: string, societyId: string) {
  return prisma.flat.findFirst({ where: scopedWhere(societyId, { id }) });
}

// Finds an existing User by email within this society (globally-unique email, but
// scoped-lookup keeps this consistent with every other tenant-scoping check in this
// feature) and updates their name/phone in place; creates a new one — random unusable
// password, then the same password-reset mechanism Task 2.4 built (docs/auth.md) — if
// none exists yet. Shared by admin/onboarding.service.ts's createFlat/updateFlat for
// both owner and tenant contact fields (CLAUDE.md's "Addition (2026-08-06)":
// onboarding a flat is one atomic action, not "create the account, then separately
// create the flat").
export async function findOrCreateUserByEmail(societyId: string, role: Role, contact: ContactFields) {
  const existing = await prisma.user.findFirst({
    where: scopedWhere(societyId, { email: contact.email }),
  });
  if (existing) {
    if (existing.role !== role) throw new ConflictingRoleError(contact.email, role, existing.role);
    return prisma.user.update({
      where: { id: existing.id },
      data: { name: contact.name, phone: contact.phone },
    });
  }

  const created = await createUser({
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    password: randomBytes(24).toString('hex'),
    role,
    societyId,
  });
  await requestPasswordReset(created.email);
  return created;
}

// Shared by admin/onboarding.service.ts's createFlat and updateFlat: applies the
// occupancy/tenant portion of a flat form save. 'tenant' with tenant contact fields
// upserts (create-or-update-in-place, never rejects an existing tenant the way the
// id-based assignTenant/Task 3.2 does — this backs a single "Save" button over one
// form, occupancy + tenant fields together). 'owner' closes any existing open
// OccupancyChange, reverting to owner-occupied.
export async function applyOccupancy(
  flatId: string,
  societyId: string,
  occupancy: 'owner' | 'tenant' | undefined,
  tenant: { name?: string; phone?: string; email?: string; effectiveFrom?: Date },
) {
  const openOccupancy = await prisma.occupancyChange.findFirst({
    where: { flatId, effectiveEnd: null },
  });

  if (occupancy === 'tenant' && tenant.email) {
    if (openOccupancy) {
      await prisma.user.update({
        where: { id: openOccupancy.tenantId },
        data: { name: tenant.name, phone: tenant.phone, email: tenant.email },
      });
      if (tenant.effectiveFrom) {
        await prisma.occupancyChange.update({
          where: { id: openOccupancy.id },
          data: { effectiveStart: tenant.effectiveFrom },
        });
      }
    } else {
      const tenantUser = await findOrCreateUserByEmail(societyId, 'TENANT', {
        name: tenant.name ?? '',
        phone: tenant.phone,
        email: tenant.email,
      });
      await prisma.$transaction([
        prisma.occupancyChange.create({
          data: {
            flatId,
            tenantId: tenantUser.id,
            effectiveStart: tenant.effectiveFrom ?? new Date(),
            effectiveEnd: null,
          },
        }),
        prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: tenantUser.id } }),
      ]);
    }
  } else if (occupancy === 'owner' && openOccupancy) {
    await prisma.$transaction([
      prisma.occupancyChange.update({
        where: { id: openOccupancy.id },
        data: { effectiveEnd: new Date() },
      }),
      prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: null } }),
    ]);
  }
}
