import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createFlat } from '../../src/services/flats.service';
import {
  approveLedgerEntry,
  computeFlatBalances,
  createCredit,
  createDeposit,
  generateDepositQr,
  getLedgerEntryFileForViewing,
  getLedgerForResident,
  InvalidAmountError,
  InvalidDepositAmountError,
  LedgerEntryAlreadyReviewedError,
  listPendingLedgerEntries,
  manualDeposit,
  rejectLedgerEntry,
} from '../../src/services/ledger.service';

describe('ledger service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerId: string;
  let adminId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Ledger Test Society ${suffix}`, address: '1 Test St', upiVpa: 'ledger-test@okhdfcbank' },
    });
    societyId = society.id;

    const flat = await createFlat({
      societyId,
      wing: 'L',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Ledger Owner',
      ownerEmail: `ledger-owner-${suffix}@example.com`,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    createdFlatIds.push(flatId);

    const admin = await prisma.user.create({
      data: {
        name: 'Ledger Admin',
        email: `ledger-admin-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;

    // Two SYSTEM charges — always implicitly "Approved," always contributing to
    // totalCharges (CLAUDE.md's ledger pivot note).
    await prisma.maintenanceRecord.createMany({
      data: [
        { flatId, period: '2026-01', payerType: 'OWNER', amount: 1000, dueDate: new Date('2026-01-15'), payerId: ownerId },
        { flatId, period: '2026-02', payerType: 'OWNER', amount: 1000, dueDate: new Date('2026-02-15'), payerId: ownerId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    const userIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  describe('computeFlatBalances / balances formula', () => {
    it('starts with the full charge total outstanding and payable, nothing approved yet', async () => {
      const balances = await computeFlatBalances(flatId);
      expect(balances.totalCharges).toBe(2000);
      expect(balances.approvedDeposits).toBe(0);
      expect(balances.approvedCredits).toBe(0);
      expect(balances.outstanding).toBe(2000);
      expect(balances.creditBalance).toBe(0);
      expect(balances.payable).toBe(2000);
    });
  });

  describe('createDeposit', () => {
    it('rejects an amount of 0 or less', async () => {
      await expect(createDeposit(ownerId, flatId, societyId, { amount: 0 })).rejects.toThrow(InvalidDepositAmountError);
    });

    it('rejects an amount greater than the current payable', async () => {
      await expect(createDeposit(ownerId, flatId, societyId, { amount: 5000 })).rejects.toThrow(
        InvalidDepositAmountError,
      );
    });

    it('creates a PENDING deposit with no proof file required', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 500 });
      expect(deposit.status).toBe('PENDING');
      expect(deposit.type).toBe('DEPOSIT');
      expect(Number(deposit.amount)).toBe(500);
      expect(deposit.fileUrl).toBeNull();

      // A PENDING deposit doesn't move the balance yet.
      const balances = await computeFlatBalances(flatId);
      expect(balances.payable).toBe(2000);
    });
  });

  describe('approveLedgerEntry / rejectLedgerEntry', () => {
    it('approving a deposit reduces Payable by its amount', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 300 });
      await approveLedgerEntry(deposit.id, societyId, adminId);

      const balances = await computeFlatBalances(flatId);
      expect(balances.approvedDeposits).toBeGreaterThanOrEqual(300);
    });

    it('returns 409-worthy error on a second review of the same entry', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 100 });
      await approveLedgerEntry(deposit.id, societyId, adminId);
      await expect(approveLedgerEntry(deposit.id, societyId, adminId)).rejects.toThrow(
        LedgerEntryAlreadyReviewedError,
      );
    });

    it('rejecting a deposit stores the reason and never moves the balance', async () => {
      const before = await computeFlatBalances(flatId);
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 50 });
      const rejected = await rejectLedgerEntry(deposit.id, societyId, adminId, 'blurry screenshot');
      expect(rejected!.status).toBe('REJECTED');
      expect(rejected!.adminNote).toBe('blurry screenshot');

      const after = await computeFlatBalances(flatId);
      expect(after.payable).toBe(before.payable);
    });

    it('returns null for an entry in a different society', async () => {
      const otherSociety = await prisma.society.create({
        data: { name: `Other Society ${suffix}`, address: '2 Test St', upiVpa: 'other@okhdfcbank' },
      });
      const result = await approveLedgerEntry('does-not-exist', otherSociety.id, adminId);
      expect(result).toBeNull();
      await prisma.society.delete({ where: { id: otherSociety.id } });
    });
  });

  describe('createCredit', () => {
    it('requires a positive amount', async () => {
      await expect(createCredit(ownerId, flatId, societyId, { amount: 0, note: 'x' })).rejects.toThrow(
        InvalidAmountError,
      );
    });

    it('creates a PENDING credit, and approving it increases credit balance / reduces payable', async () => {
      const before = await computeFlatBalances(flatId);
      const credit = await createCredit(ownerId, flatId, societyId, { amount: 200, note: 'Paid lift technician' });
      expect(credit.status).toBe('PENDING');
      expect(credit.note).toBe('Paid lift technician');

      await approveLedgerEntry(credit.id, societyId, adminId);
      const after = await computeFlatBalances(flatId);
      expect(after.creditBalance).toBe(before.creditBalance + 200);
      expect(after.payable).toBe(Math.max(0, before.payable - 200));
    });
  });

  describe('generateDepositQr', () => {
    it('rejects an amount above the current payable', async () => {
      const balances = await computeFlatBalances(flatId);
      await expect(generateDepositQr(flatId, societyId, balances.payable + 1)).rejects.toThrow(
        InvalidDepositAmountError,
      );
    });

    it('returns a QR + UPI link for a valid amount', async () => {
      const balances = await computeFlatBalances(flatId);
      const result = await generateDepositQr(flatId, societyId, Math.min(1, balances.payable) || 1);
      expect(result.amount).toBeGreaterThan(0);
      expect(result.upiLink).toContain('upi://pay');
      expect(result.qrDataUrl).toContain('data:image/png;base64,');
    });
  });

  describe('getLedgerForResident', () => {
    it('merges SYSTEM charges with LedgerEntry rows and includes the running totals', async () => {
      const ledger = await getLedgerForResident(flatId);
      expect(ledger.entries.some((e) => e.type === 'SYSTEM')).toBe(true);
      expect(ledger.entries.some((e) => e.type === 'DEPOSIT')).toBe(true);
      expect(ledger.entries.some((e) => e.type === 'CREDIT')).toBe(true);
      expect(ledger.totals.totalCharges).toBe(2000);
    });
  });

  describe('listPendingLedgerEntries', () => {
    it('filters by status and type', async () => {
      const pendingDeposits = await listPendingLedgerEntries(societyId, { status: 'PENDING', type: 'DEPOSIT' });
      expect(pendingDeposits.every((e) => e.status === 'PENDING' && e.type === 'DEPOSIT')).toBe(true);
    });
  });

  describe('manualDeposit', () => {
    it('creates an already-APPROVED deposit for cash/bank-transfer', async () => {
      const before = await computeFlatBalances(flatId);
      const entry = await manualDeposit(societyId, adminId, flatId, 150);
      expect(entry!.status).toBe('APPROVED');
      expect(entry!.note).toContain('Manual deposit');

      const after = await computeFlatBalances(flatId);
      expect(after.approvedDeposits).toBe(before.approvedDeposits + 150);
    });

    it('returns null for a flat in a different society', async () => {
      const otherSociety = await prisma.society.create({
        data: { name: `Other Society 2 ${suffix}`, address: '3 Test St', upiVpa: 'other2@okhdfcbank' },
      });
      const result = await manualDeposit(otherSociety.id, adminId, flatId, 100);
      expect(result).toBeNull();
      await prisma.society.delete({ where: { id: otherSociety.id } });
    });
  });

  describe('getLedgerEntryFileForViewing', () => {
    it('returns null when the entry has no file attached', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 10 });
      const result = await getLedgerEntryFileForViewing(deposit.id, ownerId, 'OWNER', societyId);
      expect(result).toBeNull();
    });
  });
});
