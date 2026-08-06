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

  it('returns the current name, upiVpa, tenantRateFactor, and defaultBaseRate', async () => {
    const settings = await getSocietySettings(societyId);
    expect(settings).toEqual({
      name: `Settings Test Society ${suffix}`,
      upiVpa: 'settings-test@okhdfcbank',
      tenantRateFactor: 1.5,
      defaultBaseRate: 1500,
    });
  });

  it('updates tenantRateFactor only, leaving everything else untouched', async () => {
    const updated = await updateSocietySettings(societyId, { tenantRateFactor: 1.75 });
    expect(updated).toEqual({
      name: `Settings Test Society ${suffix}`,
      upiVpa: 'settings-test@okhdfcbank',
      tenantRateFactor: 1.75,
      defaultBaseRate: 1500,
    });
  });

  it('updates defaultBaseRate only, leaving everything else untouched', async () => {
    const updated = await updateSocietySettings(societyId, { defaultBaseRate: 1800 });
    expect(updated.defaultBaseRate).toBe(1800);
    expect(updated.tenantRateFactor).toBe(1.75);
  });

  it('updates the society name and UPI ID', async () => {
    const updated = await updateSocietySettings(societyId, {
      name: 'Renamed Society',
      upiVpa: 'renamed-society@upi',
    });
    expect(updated.name).toBe('Renamed Society');
    expect(updated.upiVpa).toBe('renamed-society@upi');
    // Unrelated fields stay untouched.
    expect(updated.defaultBaseRate).toBe(1800);
    expect(updated.tenantRateFactor).toBe(1.75);
  });

  it('updates all four fields together', async () => {
    const updated = await updateSocietySettings(societyId, {
      name: 'Final Society Name',
      upiVpa: 'final@upi',
      tenantRateFactor: 2,
      defaultBaseRate: 2000,
    });
    expect(updated).toEqual({
      name: 'Final Society Name',
      upiVpa: 'final@upi',
      tenantRateFactor: 2,
      defaultBaseRate: 2000,
    });
  });
});
