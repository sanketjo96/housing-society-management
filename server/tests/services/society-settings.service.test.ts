import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { getSocietySettings, updateSocietySettings } from '../../src/services/society-settings.service';

describe('society-settings service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Settings Test Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'settings-test@okhdfcbank',
        tenantRateFactor: 1.5,
        defaultBaseRate: 1500,
      },
    });
    societyId = society.id;
  });

  afterAll(async () => {
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('returns the current tenantRateFactor and defaultBaseRate', async () => {
    const settings = await getSocietySettings(societyId);
    expect(settings).toEqual({ tenantRateFactor: 1.5, defaultBaseRate: 1500 });
  });

  it('updates tenantRateFactor only, leaving defaultBaseRate untouched', async () => {
    const updated = await updateSocietySettings(societyId, { tenantRateFactor: 1.75 });
    expect(updated).toEqual({ tenantRateFactor: 1.75, defaultBaseRate: 1500 });
  });

  it('updates defaultBaseRate only, leaving tenantRateFactor untouched', async () => {
    const updated = await updateSocietySettings(societyId, { defaultBaseRate: 1800 });
    expect(updated).toEqual({ tenantRateFactor: 1.75, defaultBaseRate: 1800 });
  });

  it('updates both fields together', async () => {
    const updated = await updateSocietySettings(societyId, { tenantRateFactor: 2, defaultBaseRate: 2000 });
    expect(updated).toEqual({ tenantRateFactor: 2, defaultBaseRate: 2000 });
  });
});
