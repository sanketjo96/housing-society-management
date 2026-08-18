import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../../src/infrastructure/prisma/client';
import { bulkImportFlats } from '../../../../src/features/flats/admin/admin-flats-onboarding-service';

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
      'wing,flatNumber,ownerName,ownerPhone,ownerEmail\n' +
      `C,101,CSV Owner One,9000000001,csv-owner-1-${suffix}@example.com\n` +
      `C,102,CSV Owner Two,9000000002,csv-owner-2-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.errors).toHaveLength(0);
    expect(result.created).toHaveLength(2);
    result.created.forEach((f) => createdFlatIds.push(f!.id));
    expect(result.created[0]!.owner.email).toBe(`csv-owner-1-${suffix}@example.com`);
  });

  it('imports a row with an occupied tenant, creating both accounts', async () => {
    const csv =
      'wing,flatNumber,ownerName,ownerPhone,ownerEmail,occupancy,tenantName,tenantEmail\n' +
      `C,103,CSV Owner Three,9000000003,csv-owner-3-${suffix}@example.com,tenant,CSV Tenant,csv-tenant-1-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.errors).toHaveLength(0);
    createdFlatIds.push(result.created[0]!.id);
    expect(result.created[0]!.currentTenant?.email).toBe(`csv-tenant-1-${suffix}@example.com`);
  });

  it('reports a per-row error for a missing required value, without failing the whole batch', async () => {
    const csv =
      'wing,flatNumber,ownerName,ownerPhone,ownerEmail\n' +
      `C,104,CSV Owner Four,9000000004,csv-owner-4-${suffix}@example.com\n` +
      'C,105,,,';
    const result = await bulkImportFlats(societyId, csv);

    expect(result.created).toHaveLength(1);
    createdFlatIds.push(result.created[0]!.id);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
  });

  it('reports a per-row error for a missing ownerPhone', async () => {
    const csv =
      'wing,flatNumber,ownerName,ownerPhone,ownerEmail\n' +
      `C,109,CSV Owner No Phone,,csv-owner-no-phone-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Missing required value/);
  });

  it('always uses the society default base rate, since bulk import has no baseRate column', async () => {
    const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
    const csv = `wing,flatNumber,ownerName,ownerPhone,ownerEmail\nC,110,CSV Owner No Rate,9000000010,csv-owner-no-rate-${suffix}@example.com`;
    const result = await bulkImportFlats(societyId, csv);

    expect(result.errors).toHaveLength(0);
    createdFlatIds.push(result.created[0]!.id);
    expect(Number(result.created[0]!.baseRate)).toBe(Number(society.defaultBaseRate));
  });

  it('reports a per-row error for a duplicate wing+flatNumber', async () => {
    const csv = `wing,flatNumber,ownerName,ownerPhone,ownerEmail\nC,107,CSV Owner,9000000007,csv-owner-6-${suffix}@example.com`;
    const first = await bulkImportFlats(societyId, csv);
    createdFlatIds.push(first.created[0]!.id);

    const second = await bulkImportFlats(societyId, csv);
    expect(second.created).toHaveLength(0);
    expect(second.errors).toHaveLength(1);
  });

  it('returns a top-level error for a CSV missing required columns', async () => {
    const csv = `wing,flatNumber\nC,108`;
    const result = await bulkImportFlats(societyId, csv);
    expect(result.created).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/Missing required column/);
  });
});
