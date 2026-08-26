// Admin id-based tenant assignment: POST/DELETE /api/admin/flats/:id/tenant. A
// lower-level alternative to createFlat/updateFlat's find-or-create-by-contact
// flow, for linking an already-known account directly.
import type { Role } from '../../../infrastructure/prisma/generated/client';
import { prisma } from '../../../infrastructure/prisma/client';
import { scopedWhere } from '../../../shared/security/tenant-scope';
import { getFlatById, NoCurrentTenantError } from '../flat-shared';

export { NoCurrentTenantError };

// Covers "id doesn't exist", "wrong society", and "not a TENANT" with one error.
export class InvalidTenantError extends Error {
  constructor() {
    super('tenantId must reference an existing TENANT in this society');
    this.name = 'InvalidTenantError';
  }
}

// Assigning a tenant to a flat that already has one is rejected, not swapped —
// removeTenant must be called first.
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

// Opens a new OccupancyChange row and syncs Flat.currentTenantId in one
// transaction. Returns null for a nonexistent or wrong-society flat id.
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

// Closes the open OccupancyChange row and syncs Flat.currentTenantId back to null
// in one transaction. Returns null for a nonexistent or wrong-society flat id.
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
