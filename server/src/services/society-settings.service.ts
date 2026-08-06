import { prisma } from '../db';

export interface SocietySettings {
  name: string;
  upiVpa: string;
  tenantRateFactor: number;
  defaultBaseRate: number;
}

export interface UpdateSocietySettingsInput {
  name?: string;
  upiVpa?: string;
  tenantRateFactor?: number;
  defaultBaseRate?: number;
}

function toSettings(society: {
  name: string;
  upiVpa: string;
  tenantRateFactor: unknown;
  defaultBaseRate: unknown;
}): SocietySettings {
  return {
    name: society.name,
    upiVpa: society.upiVpa,
    tenantRateFactor: Number(society.tenantRateFactor),
    defaultBaseRate: Number(society.defaultBaseRate),
  };
}

export async function getSocietySettings(societyId: string): Promise<SocietySettings> {
  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: { name: true, upiVpa: true, tenantRateFactor: true, defaultBaseRate: true },
  });
  return toSettings(society);
}

// name and upiVpa added (2026-08-06 addendum) alongside the original
// tenantRateFactor/defaultBaseRate pair — an admin needs to correct the society's
// display name or rotate the UPI collection address without a DB migration/support
// request. upiVpa feeds every future QR generation directly (lib/upi.ts's
// buildUpiDeepLink), read fresh from the Society row each time, same "no caching"
// guarantee tenantRateFactor already has.
export async function updateSocietySettings(
  societyId: string,
  input: UpdateSocietySettingsInput,
): Promise<SocietySettings> {
  const society = await prisma.society.update({
    where: { id: societyId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.upiVpa !== undefined ? { upiVpa: input.upiVpa } : {}),
      ...(input.tenantRateFactor !== undefined ? { tenantRateFactor: input.tenantRateFactor } : {}),
      ...(input.defaultBaseRate !== undefined ? { defaultBaseRate: input.defaultBaseRate } : {}),
    },
    select: { name: true, upiVpa: true, tenantRateFactor: true, defaultBaseRate: true },
  });
  return toSettings(society);
}
