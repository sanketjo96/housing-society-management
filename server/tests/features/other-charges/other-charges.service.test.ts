import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { createFeeType, updateFeeType } from '../../../src/features/fee-types/fee-types.service';
import { computeFlatBalances } from '../../../src/features/ledger/ledger-shared';
import { getResidentBalancesSummary } from '../../../src/features/ledger/resident/resident-ledger-service';
import {
  billOtherCharge,
  FeeTypeNotBillableError,
  FlatNotFoundError,
  InvalidAmountError,
  listOtherCharges,
} from '../../../src/features/other-charges/other-charges.service';

describe('other-charges service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let otherSocietyId: string;
  let flatId: string;
  let ownerId: string;
  let tenantId: string | undefined;
  let adminId: string;
  let feeTypeId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Other Charges Test Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;

    const flat = await createFlat({
      societyId,
      wing: 'O',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Charges Owner',
      ownerEmail: `charges-owner-${suffix}@example.com`,
      occupancy: 'tenant',
      tenantName: 'Charges Tenant',
      tenantEmail: `charges-tenant-${suffix}@example.com`,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    tenantId = flat!.currentTenantId ?? undefined;
    createdFlatIds.push(flatId);

    const admin = await prisma.user.create({
      data: {
        name: 'Charges Admin',
        email: `charges-admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;

    const feeType = await createFeeType(societyId, adminId, { name: `Transfer Fee ${suffix}` });
    feeTypeId = feeType.id;

    // A maintenance charge, to prove Other Charges never touches this pool.
    await prisma.maintenanceRecord.create({
      data: {
        flatId,
        period: '2026-01',
        payerType: 'TENANT',
        amount: 1500,
        dueDate: new Date('2026-01-16'),
        payerId: tenantId!,
      },
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.otherCharge.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.feeType.deleteMany({ where: { societyId: { in: [societyId, otherSocietyId] } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = [ownerId, tenantId, adminId].filter((id): id is string => !!id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
  });

  it('rejects a non-positive amount', async () => {
    await expect(
      billOtherCharge(societyId, adminId, { flatId, feeTypeId, amount: 0 }),
    ).rejects.toThrow(InvalidAmountError);
  });

  it('rejects a flat from a different society', async () => {
    await expect(
      billOtherCharge(otherSocietyId, adminId, { flatId, feeTypeId, amount: 100 }),
    ).rejects.toThrow(FlatNotFoundError);
  });

  it('rejects an inactive fee type', async () => {
    const inactive = await createFeeType(societyId, adminId, { name: `Inactive Fee ${suffix}` });
    await updateFeeType(inactive.id, societyId, adminId, { isActive: false });
    await expect(
      billOtherCharge(societyId, adminId, { flatId, feeTypeId: inactive.id, amount: 100 }),
    ).rejects.toThrow(FeeTypeNotBillableError);
  });

  it('rejects a fee type from a different society', async () => {
    const crossFeeType = await createFeeType(otherSocietyId, adminId, { name: `Cross Fee ${suffix}` });
    await expect(
      billOtherCharge(societyId, adminId, { flatId, feeTypeId: crossFeeType.id, amount: 100 }),
    ).rejects.toThrow(FeeTypeNotBillableError);
  });

  it('always bills the OWNER, even when the flat is tenant-occupied', async () => {
    const charge = await billOtherCharge(societyId, adminId, { flatId, feeTypeId, amount: 5000 });
    expect(charge.payerId).toBe(ownerId);
    expect(charge.payerId).not.toBe(tenantId);
  });

  it('sets dueDate to roughly 15 days out, and billedById to the admin', async () => {
    const charge = await billOtherCharge(societyId, adminId, { flatId, feeTypeId, amount: 1000 });
    const daysOut = (charge.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysOut).toBeGreaterThan(14.9);
    expect(daysOut).toBeLessThan(15.1);
    expect(charge.billedById).toBe(adminId);
  });

  it('writes a BILL_OTHER_CHARGE audit log entry', async () => {
    const charge = await billOtherCharge(societyId, adminId, { flatId, feeTypeId, amount: 2500 });
    const log = await prisma.auditLog.findFirst({
      where: { entityId: charge.id, entityType: 'OtherCharge' },
    });
    expect(log?.action).toBe('BILL_OTHER_CHARGE');
    expect(log?.actorId).toBe(adminId);
  });

  it('contributes to the Other-Charges pool but NEVER to Maintenance Outstanding', async () => {
    const before = await computeFlatBalances(flatId);
    await billOtherCharge(societyId, adminId, { flatId, feeTypeId, amount: 7500 });
    const after = await computeFlatBalances(flatId);
    const otherCharges = await computeFlatBalances(flatId, undefined, 'OTHER_CHARGE');

    // Maintenance Outstanding is completely untouched by billing an Other Charge.
    expect(after.outstanding).toBe(before.outstanding);
    expect(after.totalCharges).toBe(before.totalCharges);
    expect(otherCharges.outstanding).toBeGreaterThanOrEqual(7500);
  });

  it('getResidentBalancesSummary keeps the two pools independent and sums them for totalOutstanding', async () => {
    const summary = await getResidentBalancesSummary(flatId);
    expect(summary.totalOutstanding).toBe(
      summary.maintenance.outstanding + summary.otherCharges.outstanding,
    );
    expect(summary.otherCharges.outstanding).toBeGreaterThan(0);
  });

  it('listOtherCharges derives settlement status via FIFO against the Other-Charges pool only', async () => {
    const society = await prisma.society.create({
      data: { name: `Settlement Test Society ${suffix}`, address: '3 Test St' },
    });
    const flat = await createFlat({
      societyId: society.id,
      wing: 'S',
      flatNumber: '1',
      baseRate: 1000,
      ownerName: 'Settlement Owner',
      ownerEmail: `settlement-owner-${suffix}@example.com`,
    });
    const admin = await prisma.user.create({
      data: {
        name: 'Settlement Admin',
        email: `settlement-admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
        societyId: society.id,
      },
    });
    const feeType = await createFeeType(society.id, admin.id, { name: `Fine ${suffix}` });

    const first = await billOtherCharge(society.id, admin.id, {
      flatId: flat!.id,
      feeTypeId: feeType.id,
      amount: 1000,
    });
    const second = await billOtherCharge(society.id, admin.id, {
      flatId: flat!.id,
      feeTypeId: feeType.id,
      amount: 1000,
    });

    // Approve a Deposit that only covers the first (oldest) charge.
    await prisma.ledgerEntry.create({
      data: {
        flatId: flat!.id,
        payerId: flat!.ownerId,
        type: 'DEPOSIT',
        status: 'APPROVED',
        amount: 1000,
        createdById: flat!.ownerId,
        createdByType: 'OWNER',
        category: 'OTHER_CHARGE',
      },
    });

    const list = await listOtherCharges(society.id);
    const firstRow = list.find((c) => c.id === first.id)!;
    const secondRow = list.find((c) => c.id === second.id)!;
    expect(firstRow.settlementStatus).toBe('PAID');
    expect(secondRow.settlementStatus).toBe('UNPAID');

    await prisma.ledgerEntry.deleteMany({ where: { flatId: flat!.id } });
    await prisma.otherCharge.deleteMany({ where: { flatId: flat!.id } });
    await prisma.feeType.deleteMany({ where: { societyId: society.id } });
    await prisma.flat.deleteMany({ where: { id: flat!.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [flat!.ownerId, admin.id] } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: [flat!.ownerId, admin.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [flat!.ownerId, admin.id] } } });
    await prisma.society.delete({ where: { id: society.id } });
  });
});
