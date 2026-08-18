// Admin id-based tenant assignment: POST/DELETE /api/admin/flats/:id/tenant (Task 3.2).
// Kept as a lower-level alternative to onboarding.service.ts's createFlat/updateFlat
// find-or-create-by-contact flow — still has a legitimate use case (linking an
// already-known account without re-typing its details). See CLAUDE.md's "Addendum
// (2026-08-06)".
import type { Role } from '../../../infrastructure/prisma/generated/client';
import { prisma } from '../../../infrastructure/prisma/client';
import { scopedWhere } from '../../../shared/security/tenant-scope';
import { getFlatById, NoCurrentTenantError } from '../flat-shared';

export { NoCurrentTenantError };

// Thrown when tenantId doesn't resolve to a TENANT-role user within the caller's own
// society — covers "id doesn't exist," "id belongs to a different society" (tenant
// scoping — Task 2.6), and "id exists but isn't a TENANT" with one error, since none
// of those are the client's business to distinguish.
export class InvalidTenantError extends Error {
  constructor() {
    super('tenantId must reference an existing TENANT in this society');
    this.name = 'InvalidTenantError';
  }
}

// Assigning a tenant to a flat that already has one is rejected rather than silently
// swapped — closing the existing OccupancyChange row is a real state change the caller
// didn't explicitly ask for. removeTenant must be called first (see docs/flats.md).
export class TenantAlreadyAssignedError extends Error {
  constructor() {
    super('Flat already has a current tenant — remove them before assigning a new one');
    this.name = 'TenantAlreadyAssignedError';
  }
}

async function userExistsWithRole(societyId: string, userId: string, role: Role): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: scopedWhere(societyId, { id: userId, role }),
    select: { id: true },
  });
  return !!user;
}

// Opens a new OccupancyChange row (effectiveStart = now, effectiveEnd = null) and
// syncs Flat.currentTenantId in one transaction (docs/data-model.md's "Assigning a
// tenant creates a new OccupancyChange row"). Returns null for a nonexistent or
// wrong-society flat id (Task 2.6 tenant scoping), same as updateFlat.
export async function assignTenant(flatId: string, societyId: string, tenantId: string) {
  const flat = await getFlatById(flatId, societyId);
  if (!flat) return null;

  if (!(await userExistsWithRole(societyId, tenantId, 'TENANT'))) throw new InvalidTenantError();

  const openOccupancy = await prisma.occupancyChange.findFirst({
    where: { flatId, effectiveEnd: null },
    select: { id: true },
  });
  if (openOccupancy) throw new TenantAlreadyAssignedError();

  const now = new Date();
  const [, updatedFlat] = await prisma.$transaction([
    prisma.occupancyChange.create({
      data: { flatId, tenantId, effectiveStart: now, effectiveEnd: null },
    }),
    prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: tenantId } }),
  ]);
  return updatedFlat;
}

// Closes the existing open OccupancyChange row (sets effectiveEnd = now) and syncs
// Flat.currentTenantId back to null in one transaction (docs/data-model.md's "Removing
// a tenant closes the existing open row — it does not create a new row"). Returns null
// for a nonexistent or wrong-society flat id, same as assignTenant/updateFlat.
export async function removeTenant(flatId: string, societyId: string) {
  const flat = await getFlatById(flatId, societyId);
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
