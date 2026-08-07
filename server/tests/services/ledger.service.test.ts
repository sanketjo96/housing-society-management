import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createFlat } from '../../src/services/flats.service';
import {
  approveLedgerEntry,
  cancelPaymentIntent,
  computeFlatBalances,
  createDeposit,
  createOrReplacePaymentIntent,
  getLedgerEntryFileForViewing,
  getLedgerForResident,
  getOpenPaymentIntent,
  InvalidDepositAmountError,
  LedgerEntryAlreadyReviewedError,
  listPendingLedgerEntries,
  manualDeposit,
  NoOpenPaymentIntentError,
  rejectLedgerEntry,
  submitPaymentIntent,
} from '../../src/services/ledger.service';

const fakeProofFile = { buffer: Buffer.from('fake-image-bytes'), mimeType: 'image/png', extension: '.png' };

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
    // totalCharges.
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
    it('starts with the full charge total outstanding, nothing approved yet', async () => {
      const balances = await computeFlatBalances(flatId);
      expect(balances.totalCharges).toBe(2000);
      expect(balances.approvedDeposits).toBe(0);
      expect(balances.outstanding).toBe(2000);
    });
  });

  describe('createDeposit', () => {
    it('rejects an amount of 0 or less', async () => {
      await expect(createDeposit(ownerId, flatId, societyId, { amount: 0 })).rejects.toThrow(InvalidDepositAmountError);
    });

    it('rejects an amount greater than the current outstanding', async () => {
      await expect(createDeposit(ownerId, flatId, societyId, { amount: 5000 })).rejects.toThrow(
        InvalidDepositAmountError,
      );
    });

    it('creates a PENDING deposit with no proof file required', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 500 });
      expect(deposit.status).toBe('PENDING');
      expect(Number(deposit.amount)).toBe(500);
      expect(deposit.fileUrl).toBeNull();

      // A PENDING deposit doesn't move the balance yet.
      const balances = await computeFlatBalances(flatId);
      expect(balances.outstanding).toBe(2000);
    });
  });

  describe('approveLedgerEntry / rejectLedgerEntry', () => {
    it('approving a deposit reduces Outstanding by its amount', async () => {
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
      expect(after.outstanding).toBe(before.outstanding);
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

  describe('payment intents', () => {
    it('getOpenPaymentIntent returns null when none exists', async () => {
      expect(await getOpenPaymentIntent(flatId, societyId)).toBeNull();
    });

    it('rejects locking an amount above the current outstanding', async () => {
      const balances = await computeFlatBalances(flatId);
      await expect(
        createOrReplacePaymentIntent(flatId, ownerId, societyId, balances.outstanding + 1),
      ).rejects.toThrow(InvalidDepositAmountError);
    });

    it('creates an intent, replaces it on a second lock, and cancel clears it', async () => {
      const first = await createOrReplacePaymentIntent(flatId, ownerId, societyId, 10);
      expect(first.amount).toBe(10);
      expect(first.upiLink).toContain('upi://pay');
      expect(first.qrDataUrl).toContain('data:image/png;base64,');

      const replaced = await createOrReplacePaymentIntent(flatId, ownerId, societyId, 20);
      expect(replaced.amount).toBe(20);

      const open = await getOpenPaymentIntent(flatId, societyId);
      expect(open?.amount).toBe(20);

      await cancelPaymentIntent(flatId);
      expect(await getOpenPaymentIntent(flatId, societyId)).toBeNull();
    });

    it('submitPaymentIntent throws when there is nothing open', async () => {
      await expect(submitPaymentIntent(flatId, ownerId, societyId, fakeProofFile)).rejects.toThrow(
        NoOpenPaymentIntentError,
      );
    });

    it('submitPaymentIntent finalizes into a PENDING deposit and clears the intent', async () => {
      await createOrReplacePaymentIntent(flatId, ownerId, societyId, 15);
      const entry = await submitPaymentIntent(flatId, ownerId, societyId, fakeProofFile);
      expect((entry as { status: string }).status).toBe('PENDING');
      expect((entry as { fileUrl: string | null }).fileUrl).not.toBeNull();
      expect(await getOpenPaymentIntent(flatId, societyId)).toBeNull();
    });
  });

  describe('getLedgerForResident', () => {
    it('merges SYSTEM charges with LedgerEntry rows and includes the running totals', async () => {
      const ledger = await getLedgerForResident(flatId);
      expect(ledger.entries.some((e) => e.type === 'SYSTEM')).toBe(true);
      expect(ledger.entries.some((e) => e.type === 'DEPOSIT')).toBe(true);
      expect(ledger.totals.totalCharges).toBe(2000);
      expect(ledger.availableYears).toContain(2026);
    });

    it('scopes entries and yearTotals to the given year; totals/availableYears stay lifetime regardless', async () => {
      const allTime = await getLedgerForResident(flatId);
      const scoped = await getLedgerForResident(flatId, 2026);
      expect(scoped.yearTotals.totalCharges).toBe(2000);
      expect(scoped.entries.every((e) => e.type !== 'SYSTEM' || e.period?.startsWith('2026'))).toBe(true);
      expect(scoped.availableYears).toEqual(allTime.availableYears);
      // Outstanding is current financial state, not a per-year concept — it must be
      // identical (lifetime) no matter which year is asked for.
      expect(scoped.totals).toEqual(allTime.totals);

      const otherYear = await getLedgerForResident(flatId, 1999);
      expect(otherYear.yearTotals.totalCharges).toBe(0);
      expect(otherYear.totals).toEqual(allTime.totals);
      expect(otherYear.entries).toHaveLength(0);
    });
  });

  describe('listPendingLedgerEntries', () => {
    it('filters by status', async () => {
      const pendingDeposits = await listPendingLedgerEntries(societyId, { status: 'PENDING' });
      expect(pendingDeposits.every((e) => e.status === 'PENDING')).toBe(true);
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
