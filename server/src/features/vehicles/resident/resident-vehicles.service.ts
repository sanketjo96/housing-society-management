// Resident self-service: registerVehicle, listMyVehicles, deleteMyVehicle.
// Ownership-scoped (req.user.id), same convention as resident-flats-service.ts.
// No audit logging here — see docs/features/vehicle-finder/01-requirements.md's
// Confirmed Product Decision #1 (declined for this feature, not deferred).
import { prisma } from '../../../infrastructure/prisma/client';
import type { VehicleType } from '../../../infrastructure/prisma/generated/client';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../../shared/errors/prisma-errors';
import { scopedWhere } from '../../../shared/security/tenant-scope';
import { normalizePlate } from '../../../shared/vehicles/normalize-plate';

export class VehicleNotFoundError extends Error {
  constructor() {
    super('Vehicle not found');
    this.name = 'VehicleNotFoundError';
  }
}

export interface RegisterVehicleInput {
  plateNumber: string;
  type: VehicleType;
}

export async function registerVehicle(societyId: string, userId: string, input: RegisterVehicleInput) {
  const plateNumber = normalizePlate(input.plateNumber);

  try {
    return await prisma.vehicle.create({
      data: { societyId, userId, plateNumber, type: input.type },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }
}

export async function listMyVehicles(societyId: string, userId: string) {
  return prisma.vehicle.findMany({
    where: scopedWhere(societyId, { userId }),
    orderBy: { createdAt: 'asc' },
  });
}

// Only deletes a vehicle owned by the calling resident — a cross-user or
// cross-society id resolves to VehicleNotFoundError, same as a nonexistent one.
export async function deleteMyVehicle(id: string, societyId: string, userId: string) {
  const { count } = await prisma.vehicle.deleteMany({
    where: scopedWhere(societyId, { id, userId }),
  });
  if (count === 0) throw new VehicleNotFoundError();
}
