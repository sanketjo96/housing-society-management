import { prisma } from '../db';

export interface SocietySettings {
  tenantRateFactor: number;
  defaultBaseRate: number;
}

export interface UpdateSocietySettingsInput {
  tenantRateFactor?: number;
  defaultBaseRate?: number;
}

function toSettings(society: { tenantRateFactor: unknown; defaultBaseRate: unknown }): SocietySettings {
  return {
    tenantRateFactor: Number(society.tenantRateFactor),
    defaultBaseRate: Number(society.defaultBaseRate),
  };
}

export async function getSocietySettings(societyId: string): Promise<SocietySettings> {
  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: { tenantRateFactor: true, defaultBaseRate: true },
  });
  return toSettings(society);
}

// Only tenantRateFactor and defaultBaseRate are editable here (Settings tab scope,
// 2026-08-06 addendum) — upiVpa/name/address stay out of this endpoint, unchanged
// since Task 1.x, no request to touch them.
export async function updateSocietySettings(
  societyId: string,
  input: UpdateSocietySettingsInput,
): Promise<SocietySettings> {
  const society = await prisma.society.update({
    where: { id: societyId },
    data: {
      ...(input.tenantRateFactor !== undefined ? { tenantRateFactor: input.tenantRateFactor } : {}),
      ...(input.defaultBaseRate !== undefined ? { defaultBaseRate: input.defaultBaseRate } : {}),
    },
    select: { tenantRateFactor: true, defaultBaseRate: true },
  });
  return toSettings(society);
}
