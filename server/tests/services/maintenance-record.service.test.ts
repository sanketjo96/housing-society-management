import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createFlat } from '../../src/services/flats.service';
import { currentPeriod, generateMaintenanceRecords } from '../../src/services/maintenance-record.service';

describe('maintenance-record service — generateMaintenanceRecords', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let ownerFlatId: string;
  let tenantFlatId: string;
  let otherSocietyFlatId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Test Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'test@okhdfcbank',
        tenantRateFactor: 1.5,
      },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Test St', upiVpa: 'other@okhdfcbank' },
    });
    otherSocietyId = otherSociety.id;

    const ownerOccupiedFlat = await createFlat({
      societyId,
      wing: 'M',
      flatNumber: '101',
      baseRate: 2000,
      ownerName: 'MR Owner One',
      ownerEmail: `mr-owner-1-${suffix}@example.com`,
    });
    ownerFlatId = ownerOccupiedFlat!.id;
    createdFlatIds.push(ownerFlatId);

    const tenantOccupiedFlat = await createFlat({
      societyId,
      wing: 'M',
      flatNumber: '102',
      baseRate: 2000,
      ownerName: 'MR Owner Two',
      ownerEmail: `mr-owner-2-${suffix}@example.com`,
      occupancy: 'tenant',
      tenantName: 'MR Tenant One',
      tenantEmail: `mr-tenant-1-${suffix}@example.com`,
      effectiveFrom: new Date('2020-01-01'),
    });
    tenantFlatId = tenantOccupiedFlat!.id;
    createdFlatIds.push(tenantFlatId);

    const otherFlat = await createFlat({
      societyId: otherSocietyId,
      wing: 'M',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'MR Other Owner',
      ownerEmail: `mr-other-owner-${suffix}@example.com`,
    });
    otherSocietyFlatId = otherFlat!.id;
    createdFlatIds.push(otherSocietyFlatId);
  });

  afterAll(async () => {
    const societyIds = [societyId, otherSocietyId];
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = await prisma.user
      .findMany({ where: { societyId: { in: societyIds } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
    await prisma.$disconnect();
  });

  it('generates one UNPAID record per flat, with the correct payer and amount', async () => {
    const period = '2026-07';
    const result = await generateMaintenanceRecords(societyId, period);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);

    const ownerRecord = await prisma.maintenanceRecord.findUniqueOrThrow({
      where: { flatId_period: { flatId: ownerFlatId, period } },
    });
    expect(ownerRecord.payerType).toBe('OWNER');
    expect(ownerRecord.status).toBe('UNPAID');
    expect(Number(ownerRecord.amount)).toBe(2000);

    const tenantRecord = await prisma.maintenanceRecord.findUniqueOrThrow({
      where: { flatId_period: { flatId: tenantFlatId, period } },
    });
    expect(tenantRecord.payerType).toBe('TENANT');
    expect(Number(tenantRecord.amount)).toBe(3000);
  });

  it('sets dueDate to 15 days after generation', async () => {
    const period = '2026-08';
    const before = Date.now();
    await generateMaintenanceRecords(societyId, period);
    const record = await prisma.maintenanceRecord.findUniqueOrThrow({
      where: { flatId_period: { flatId: ownerFlatId, period } },
    });
    const expectedMs = before + 15 * 24 * 60 * 60 * 1000;
    expect(record.dueDate.getTime()).toBeGreaterThanOrEqual(expectedMs - 5000);
    expect(record.dueDate.getTime()).toBeLessThanOrEqual(expectedMs + 5000 + (Date.now() - before));
  });

  it('is idempotent — running the same period twice does not duplicate records', async () => {
    const period = '2026-09';
    const first = await generateMaintenanceRecords(societyId, period);
    expect(first.created).toBe(2);

    const second = await generateMaintenanceRecords(societyId, period);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    const count = await prisma.maintenanceRecord.count({
      where: { flatId: { in: [ownerFlatId, tenantFlatId] }, period },
    });
    expect(count).toBe(2);
  });

  it('does not create records for flats in a different society', async () => {
    const period = '2026-10';
    await generateMaintenanceRecords(societyId, period);
    const otherRecord = await prisma.maintenanceRecord.findUnique({
      where: { flatId_period: { flatId: otherSocietyFlatId, period } },
    });
    expect(otherRecord).toBeNull();
  });

  it('defaults to the current calendar period when none is given', () => {
    const now = new Date('2026-03-15T00:00:00Z');
    expect(currentPeriod(now)).toBe('2026-03');
  });
});
