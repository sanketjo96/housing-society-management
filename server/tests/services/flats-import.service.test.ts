import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { bulkImportFlats } from '../../src/services/flats.service';

// Owner/tenant accounts are created inline by each row (see CLAUDE.md's "Addition
// (2026-08-06)") — no pre-existing user needed, matching the admin UI's CSV import.
describe('flats service — bulkImportFlats', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;
  });

  afterAll(async () => {
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('creates flats for valid rows, provisioning owner accounts inline', async () => {
    const csv =
      'block,flatNumber,baseRate,ownerName,ownerEmail\n' +
      `C,101,1500,CSV Owner One,csv-owner-1-${suffix}@example.com\n` +
      `C,102,1600,CSV Owner Two,csv-owner-2-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.errors).toHaveLength(0);
    expect(result.created).toHaveLength(2);
    result.created.forEach((f) => createdFlatIds.push(f!.id));
    expect(result.created[0]!.owner.email).toBe(`csv-owner-1-${suffix}@example.com`);
  });

  it('imports a row with an occupied tenant, creating both accounts', async () => {
    const csv =
      'block,flatNumber,baseRate,ownerName,ownerEmail,occupancy,tenantName,tenantEmail\n' +
      `C,103,1500,CSV Owner Three,csv-owner-3-${suffix}@example.com,tenant,CSV Tenant,csv-tenant-1-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.errors).toHaveLength(0);
    createdFlatIds.push(result.created[0]!.id);
    expect(result.created[0]!.currentTenant?.email).toBe(`csv-tenant-1-${suffix}@example.com`);
  });

  it('reports a per-row error for a missing required value, without failing the whole batch', async () => {
    const csv =
      'block,flatNumber,baseRate,ownerName,ownerEmail\n' +
      `C,104,1500,CSV Owner Four,csv-owner-4-${suffix}@example.com\n` +
      'C,105,1500,,';
    const result = await bulkImportFlats(societyId, csv);

    expect(result.created).toHaveLength(1);
    createdFlatIds.push(result.created[0]!.id);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
  });

  it('reports a per-row error for an invalid baseRate', async () => {
    const csv = `block,flatNumber,baseRate,ownerName,ownerEmail\nC,106,not-a-number,CSV Owner,csv-owner-5-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/baseRate/);
  });

  it('reports a per-row error for a duplicate block+flatNumber', async () => {
    const csv = `block,flatNumber,baseRate,ownerName,ownerEmail\nC,107,1500,CSV Owner,csv-owner-6-${suffix}@example.com`;
    const first = await bulkImportFlats(societyId, csv);
    createdFlatIds.push(first.created[0]!.id);

    const second = await bulkImportFlats(societyId, csv);
    expect(second.created).toHaveLength(0);
    expect(second.errors).toHaveLength(1);
  });

  it('returns a top-level error for a CSV missing required columns', async () => {
    const csv = `block,flatNumber\nC,108`;
    const result = await bulkImportFlats(societyId, csv);
    expect(result.created).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/Missing required column/);
  });
});
