// Vehicle Finder search — a pure read. Deliberately writes nothing (no
// AuditLog, no other record) on either a hit or a miss; see
// docs/features/vehicle-finder/01-requirements.md's Confirmed Product
// Decision #1 — audit logging of lookups was considered and explicitly
// declined for this feature, not deferred.
import { prisma } from '../../../infrastructure/prisma/client';
import { scopedWhere } from '../../../shared/security/tenant-scope';
import { normalizePlate } from '../../../shared/vehicles/normalize-plate';

export interface VehicleSearchHit {
  found: true;
  wing: string;
  flatNumber: string;
  occupantName: string;
  occupantPhone: string | null;
}

export interface VehicleSearchMiss {
  found: false;
}

export async function searchVehicle(
  societyId: string,
  plate: string,
): Promise<VehicleSearchHit | VehicleSearchMiss> {
  const plateNumber = normalizePlate(plate);

  const vehicle = await prisma.vehicle.findFirst({
    where: scopedWhere(societyId, { plateNumber }),
    include: {
      user: {
        include: { ownedFlats: true, currentTenantFlats: true },
      },
    },
  });
  if (!vehicle) return { found: false };

  // A registrant is always either the current tenant or the owner of exactly
  // one flat — same resolution the "my flat" resident endpoints already do.
  const flat = vehicle.user.currentTenantFlats[0] ?? vehicle.user.ownedFlats[0];
  if (!flat) return { found: false };

  return {
    found: true,
    wing: flat.wing,
    flatNumber: flat.flatNumber,
    occupantName: vehicle.user.name,
    occupantPhone: vehicle.user.phone,
  };
}
