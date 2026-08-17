import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';

describe('MaintenanceRecord as an always-Approved SYSTEM charge (ledger pivot)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let flatId: string;
  let recordId: string;

  afterAll(async () => {
    if (recordId) await prisma.maintenanceRecord.delete({ where: { id: recordId } });
    if (flatId) await prisma.flat.delete({ where: { id: flatId } });
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('is created with a dueDate and a payer, and has no per-record status column', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Test Owner',
        email: `owner-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'OWNER',
        societyId: society.id,
      },
    });
    ownerId = owner.id;

    const flat = await prisma.flat.create({
      data: {
        wing: 'A',
        flatNumber: `101-${suffix}`,
        baseRate: 1000,
        societyId: society.id,
        ownerId: owner.id,
      },
    });
    flatId = flat.id;

    const dueDate = new Date('2026-02-15');
    const record = await prisma.maintenanceRecord.create({
      data: {
        flatId: flat.id,
        period: '2026-01',
        payerType: 'OWNER',
        amount: 1000,
        dueDate,
        payerId: owner.id,
      },
    });
    recordId = record.id;

    expect(record.dueDate).toEqual(dueDate);
    expect(record.payerId).toBe(owner.id);
    expect('status' in record).toBe(false);
  });
});
