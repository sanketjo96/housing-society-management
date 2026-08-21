import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { createFeeType } from '../../../src/features/fee-types/fee-types.service';
import {
  bulkImportCharges,
  OPENING_BALANCE_PERIOD,
} from '../../../src/features/bulk-charges/bulk-charges.service';

describe('bulk-charges service — bulkImportCharges', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminId: string;
  let flatId: string;
  let ownerId: string;
  let feeTypeId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Bulk Charges Test Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const admin = await prisma.user.create({
      data: {
        name: 'Bulk Charges Admin',
        email: `bulk-charges-admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;

    const flat = await createFlat({
      societyId,
      wing: 'X',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Bulk Charges Owner',
      ownerEmail: `bulk-charges-owner-${suffix}@example.com`,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    createdFlatIds.push(flatId);

    const feeType = await createFeeType(societyId, adminId, { name: `Water Connection ${suffix}` });
    feeTypeId = feeType.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.otherCharge.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.feeType.deleteMany({ where: { id: feeTypeId } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: [ownerId, adminId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
    await prisma.society.delete({ where: { id: societyId } });
  });

  it('imports a MAINTENANCE_OPENING_BALANCE row as a sentinel-period MaintenanceRecord', async () => {
    const csv =
      'wing,flatnumber,pool,amount,note\n' + `X,101,MAINTENANCE_OPENING_BALANCE,15000,Legacy arrears`;
    const result = await bulkImportCharges(societyId, adminId, csv);

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toBe(1);

    const record = await prisma.maintenanceRecord.findFirst({
      where: { flatId, period: OPENING_BALANCE_PERIOD },
    });
    expect(record).toBeTruthy();
    expect(Number(record!.amount)).toBe(15000);
    expect(record!.payerId).toBe(ownerId);
    expect(record!.payerType).toBe('OWNER');

    const log = await prisma.auditLog.findFirst({
      where: { entityId: record!.id, entityType: 'MaintenanceRecord' },
    });
    expect(log?.action).toBe('IMPORT_OPENING_BALANCE');
    expect(log?.note).toContain('Legacy arrears');
  });

  it('reports a row error, not a duplicate, when Opening Balance is re-imported for the same flat', async () => {
    const csv = 'wing,flatnumber,pool,amount\n' + `X,101,MAINTENANCE_OPENING_BALANCE,999`;
    const result = await bulkImportCharges(societyId, adminId, csv);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/already imported/);
  });

  it('imports an OTHER_CHARGE row, resolving the fee type by name and reusing billOtherCharge', async () => {
    const csv =
      'wing,flatnumber,pool,feetypename,amount\n' +
      `X,101,OTHER_CHARGE,Water Connection ${suffix},2500`;
    const result = await bulkImportCharges(societyId, adminId, csv);

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toBe(1);

    const charge = await prisma.otherCharge.findFirst({ where: { flatId, feeTypeId } });
    expect(charge).toBeTruthy();
    expect(Number(charge!.amount)).toBe(2500);
    expect(charge!.payerId).toBe(ownerId);
  });

  it('reports a row error for an unknown fee type, without failing the batch', async () => {
    const csv =
      'wing,flatnumber,pool,feetypename,amount\n' +
      `X,101,OTHER_CHARGE,Nonexistent Fee,100\n` +
      `X,101,OTHER_CHARGE,Water Connection ${suffix},100`;
    const result = await bulkImportCharges(societyId, adminId, csv);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/not found or inactive/);
  });

  it('reports a row error for an unknown flat, without failing the batch', async () => {
    const csv =
      'wing,flatnumber,pool,amount\n' +
      `Z,999,MAINTENANCE_OPENING_BALANCE,500\n` +
      `X,101,MAINTENANCE_OPENING_BALANCE,500`;
    const result = await bulkImportCharges(societyId, adminId, csv);
    expect(result.errors.some((e) => e.message.includes('not found'))).toBe(true);
    // The second (valid-flat) row is itself a re-import of an already-imported
    // Opening Balance — still a row error, but a different one, proving the batch
    // kept going past the first row's failure rather than stopping.
    expect(result.errors).toHaveLength(2);
  });

  it('rejects an invalid pool value as a row error', async () => {
    const csv = 'wing,flatnumber,pool,amount\n' + `X,101,NOT_A_POOL,100`;
    const result = await bulkImportCharges(societyId, adminId, csv);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/pool must be/);
  });

  it('returns a top-level error for a CSV missing required columns', async () => {
    const csv = 'wing,flatnumber\nX,101';
    const result = await bulkImportCharges(societyId, adminId, csv);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/Missing required column/);
  });
});
