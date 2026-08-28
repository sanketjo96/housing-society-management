// Internals shared across flats/admin and flats/resident: find-or-create-account,
// the occupancy-apply transaction, and shared errors. Not imported by controllers
// directly.
import { randomBytes } from 'crypto';
import type { Role } from '../../infrastructure/prisma/generated/client';
import { prisma } from '../../infrastructure/prisma/client';
import { scopedWhere } from '../../shared/security/tenant-scope';
import { createUser } from '../users/admin/admin-users-service';
import { requestPasswordReset } from '../auth/auth.service';

// Thrown when a supplied email already belongs to a User in this society under a
// different role — one email can't wear two roles.
export class ConflictingRoleError extends Error {
  constructor(email: string, expectedRole: Role, actualRole: Role) {
    super(
      `${email} already exists as ${actualRole} in this society, cannot also be ${expectedRole}`,
    );
    this.name = 'ConflictingRoleError';
  }
}

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

// A flat id from a different society returns null, same as a nonexistent id.
export async function getFlatById(id: string, societyId: string) {
  return prisma.flat.findFirst({ where: scopedWhere(societyId, { id }) });
}

// Finds an existing User by email in this society and updates their name/phone in
// place; otherwise creates one with a random unusable password and triggers a
// password-reset email.
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

// Applies the occupancy/tenant portion of a flat form save. 'tenant' upserts the
// tenant in place (never rejects an already-assigned tenant). 'owner' closes any
// open OccupancyChange, reverting to owner-occupied.
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
      // Vehicle Finder (docs/features/vehicle-finder/): a departed tenant's vehicles
      // must stop surfacing against a flat they no longer occupy — same rule as
      // removeOwnTenant/removeTenant, this is the third (combined-form) path that
      // ends a tenancy.
      prisma.vehicle.deleteMany({ where: { userId: openOccupancy.tenantId } }),
    ]);
  }
}
