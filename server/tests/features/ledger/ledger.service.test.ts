import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import {
  balancesFromRows,
  computeFlatBalances,
  computeRecordSettlements,
} from '../../../src/features/ledger/ledger-shared';
import {
  approveLedgerEntry,
  LedgerEntryAlreadyReviewedError,
  listPendingLedgerEntries,
  manualDeposit,
  rejectLedgerEntry,
} from '../../../src/features/ledger/admin/admin-ledger-service';
import {
  cancelPaymentIntent,
  createDeposit,
  createOrReplacePaymentIntent,
  getLedgerEntryFileForViewing,
  getLedgerForResident,
  getOpenPaymentIntent,
  IntentAlreadyOpenForOtherCategoryError,
  InvalidAmountError,
  NoOpenPaymentIntentError,
  PaymentMethodNotConfiguredError,
  submitPaymentIntent,
} from '../../../src/features/ledger/resident/resident-ledger-service';
import { createFeeType } from '../../../src/features/fee-types/fee-types.service';
import { billOtherCharge } from '../../../src/features/other-charges/other-charges.service';

const fakeProofFile = {
  buffer: Buffer.from('fake-image-bytes'),
  mimeType: 'image/png',
  extension: '.png',
};

describe('ledger service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerId: string;
  let adminId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Ledger Test Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'ledger-test@okhdfcbank',
      },
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
        {
          flatId,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 1000,
          dueDate: new Date('2026-01-15'),
          payerId: ownerId,
        },
        {
          flatId,
          period: '2026-02',
          payerType: 'OWNER',
          amount: 1000,
          dueDate: new Date('2026-02-15'),
          payerId: ownerId,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.receipt.deleteMany({ where: { societyId } });
    await prisma.ledgerEntry.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.otherCharge.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.feeType.deleteMany({ where: { societyId } });
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

  // Pure-function coverage of the FIFO settlement spec's worked test cases (Cases
  // 1-9; overpayment past a record's amount is covered by the "overpaying a Deposit
  // past Outstanding" describe block below, since a Deposit is no longer capped at
  // Outstanding — 2026-08-20 pivot).
  describe('computeRecordSettlements (FIFO fill)', () => {
    const jun = { id: 'jun', period: '2026-06', amount: 800 };
    const jul = { id: 'jul', period: '2026-07', amount: 800 };
    const aug = { id: 'aug', period: '2026-08', amount: 800 };

    it('Case 1: exact single-cycle payment pays the record in full', () => {
      const result = computeRecordSettlements([jun], 800);
      expect(result.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
    });

    it('Case 2: underpayment on a single record leaves it partially settled', () => {
      const result = computeRecordSettlements([jun], 350);
      expect(result.get('jun')).toEqual({ settledAmount: 350, status: 'PARTIALLY_SETTLED' });
    });

    it('Case 3: a top-up bringing the cumulative total to the full amount pays it off', () => {
      // Derived from the flat's *cumulative* approved-deposit sum, not applied
      // incrementally — 350 (already approved) + 450 (this top-up) = 800.
      const result = computeRecordSettlements([jun], 800);
      expect(result.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
    });

    it('Case 4: payment spanning two records exactly pays both in full', () => {
      const result = computeRecordSettlements([jun, jul], 1600);
      expect(result.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(result.get('jul')).toEqual({ settledAmount: 800, status: 'PAID' });
    });

    it('Case 5: payment covers one record fully and partially fills the next', () => {
      const result = computeRecordSettlements([jun, jul], 1000);
      expect(result.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(result.get('jul')).toEqual({ settledAmount: 200, status: 'PARTIALLY_SETTLED' });
    });

    it('Case 6: a small payment only touches the oldest record, leaving newer ones untouched', () => {
      const result = computeRecordSettlements([jun, jul], 200);
      expect(result.get('jun')).toEqual({ settledAmount: 200, status: 'PARTIALLY_SETTLED' });
      expect(result.get('jul')).toEqual({ settledAmount: 0, status: 'UNPAID' });
    });

    it('Case 7: sequential partial payments closing one record gradually — checked at each cumulative total', () => {
      expect(computeRecordSettlements([jun], 300).get('jun')).toEqual({
        settledAmount: 300,
        status: 'PARTIALLY_SETTLED',
      });
      expect(computeRecordSettlements([jun], 550).get('jun')).toEqual({
        settledAmount: 550,
        status: 'PARTIALLY_SETTLED',
      });
      expect(computeRecordSettlements([jun], 800).get('jun')).toEqual({
        settledAmount: 800,
        status: 'PAID',
      });
    });

    it('Case 8: a new due cycle appearing mid-history does not disturb an already-partial older record', () => {
      // Jun already has 300 of 800 settled; Jul is a brand-new record, no extra
      // payment has happened — approvedDeposits is still just the 300 from Jun.
      const result = computeRecordSettlements([jun, jul], 300);
      expect(result.get('jun')).toEqual({ settledAmount: 300, status: 'PARTIALLY_SETTLED' });
      expect(result.get('jul')).toEqual({ settledAmount: 0, status: 'UNPAID' });
    });

    it('Case 9: a payment spills across a partially settled record into the next unpaid one', () => {
      // Jun already partially settled at 300 (needs 500 more); this payment is 1000
      // on top, so cumulative approvedDeposits = 300 + 1000 = 1300.
      const result = computeRecordSettlements([jun, jul, aug], 1300);
      expect(result.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(result.get('jul')).toEqual({ settledAmount: 500, status: 'PARTIALLY_SETTLED' });
      expect(result.get('aug')).toEqual({ settledAmount: 0, status: 'UNPAID' });
    });

    it('is order-independent of input record ordering — always fills oldest period first', () => {
      const result = computeRecordSettlements([aug, jun, jul], 1000);
      expect(result.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(result.get('jul')).toEqual({ settledAmount: 200, status: 'PARTIALLY_SETTLED' });
      expect(result.get('aug')).toEqual({ settledAmount: 0, status: 'UNPAID' });
    });

    it('handles records with differing amounts, not just a fixed unit', () => {
      const small = { id: 'small', period: '2026-06', amount: 500 };
      const large = { id: 'large', period: '2026-07', amount: 1200 };
      const result = computeRecordSettlements([small, large], 900);
      expect(result.get('small')).toEqual({ settledAmount: 500, status: 'PAID' });
      expect(result.get('large')).toEqual({ settledAmount: 400, status: 'PARTIALLY_SETTLED' });
    });

    it('returns UNPAID with 0 settled when there are no approved deposits at all', () => {
      const result = computeRecordSettlements([jun], 0);
      expect(result.get('jun')).toEqual({ settledAmount: 0, status: 'UNPAID' });
    });
  });

  // Credit (a separate resident-requested adjustment type) was removed for good on
  // 2026-08-20 — see CLAUDE.md's pivot addendum. Overpaying a Deposit past
  // Outstanding is allowed now and produces exactly the same "leftover becomes
  // Available Credit" result via the plain balancesFromRows/computeRecordSettlements
  // formula — no separate credit-allocation cases needed any more.
  describe('overpaying a Deposit past Outstanding (balancesFromRows + computeRecordSettlements combined)', () => {
    const jun = { id: 'jun', period: '2026-06', amount: 800 };
    const jul = { id: 'jul', period: '2026-07', amount: 800 };

    function run(
      records: { id: string; period: string; amount: number }[],
      entries: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; amount: number }[],
    ) {
      const balances = balancesFromRows(records, entries);
      const settlements = computeRecordSettlements(records, balances.approvedDeposits);
      return { balances, settlements };
    }

    it('a Deposit smaller than a single outstanding record only partially settles it', () => {
      const { balances, settlements } = run([jun], [{ status: 'APPROVED', amount: 550 }]);
      expect(settlements.get('jun')).toEqual({ settledAmount: 550, status: 'PARTIALLY_SETTLED' });
      expect(balances.outstanding).toBe(250);
      expect(balances.availableCredit).toBe(0);
    });

    it('a Deposit larger than total outstanding settles it in full and the leftover becomes Available Credit', () => {
      const { balances, settlements } = run([jun], [{ status: 'APPROVED', amount: 1200 }]);
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(balances.outstanding).toBe(0);
      expect(balances.availableCredit).toBe(400);
    });

    it('a Deposit exactly equal to the outstanding amount settles it with no leftover', () => {
      const { balances, settlements } = run([jun], [{ status: 'APPROVED', amount: 800 }]);
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(balances.outstanding).toBe(0);
      expect(balances.availableCredit).toBe(0);
    });

    it('a still-pending Deposit has zero effect on any balance', () => {
      const { balances, settlements } = run([jun], [{ status: 'PENDING', amount: 550 }]);
      expect(settlements.get('jun')).toEqual({ settledAmount: 0, status: 'UNPAID' });
      expect(balances.outstanding).toBe(800);
      expect(balances.availableCredit).toBe(0);
    });

    it('Available Credit is automatically consumed when a new due is generated — no special "consumption" code needed, just rerunning the same fill against a larger record set', () => {
      const entries = [{ status: 'APPROVED' as const, amount: 1200 }];
      const before = run([jun], entries);
      expect(before.balances.outstanding).toBe(0);
      expect(before.balances.availableCredit).toBe(400);

      // Jul is generated later — same entries, one more record.
      const after = run([jun, jul], entries);
      expect(after.settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(after.settlements.get('jul')).toEqual({
        settledAmount: 400,
        status: 'PARTIALLY_SETTLED',
      });
      expect(after.balances.outstanding).toBe(400);
      expect(after.balances.availableCredit).toBe(0);
    });
  });

  describe('createDeposit', () => {
    it('rejects an amount of 0 or less', async () => {
      await expect(createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 0 })).rejects.toThrow(
        InvalidAmountError,
      );
    });

    it('accepts an amount greater than the current outstanding — no longer capped (2026-08-20 pivot); the excess becomes Available Credit once approved', async () => {
      // Uses its own flat (rather than the shared `flatId`) so approving here doesn't
      // disturb the shared flat's outstanding balance that later tests depend on.
      const overpaySuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const overpayFlat = await createFlat({
        societyId,
        wing: 'L',
        flatNumber: `OVP-${overpaySuffix}`,
        baseRate: 1000,
        ownerName: 'Overpay Owner',
        ownerEmail: `overpay-owner-${overpaySuffix}@example.com`,
      });
      createdFlatIds.push(overpayFlat!.id);
      await prisma.maintenanceRecord.create({
        data: {
          flatId: overpayFlat!.id,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 800,
          dueDate: new Date('2026-01-15'),
          payerId: overpayFlat!.ownerId,
        },
      });

      const deposit = await createDeposit(overpayFlat!.ownerId, overpayFlat!.id, societyId, 'OWNER', {
        amount: 1300,
      });
      expect(deposit.status).toBe('PENDING');
      await approveLedgerEntry(deposit.id, societyId, adminId);

      const after = await computeFlatBalances(overpayFlat!.id);
      expect(after.outstanding).toBe(0);
      expect(after.availableCredit).toBe(500);
    });

    it('creates a PENDING deposit with no proof file required', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 500 });
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
      const deposit = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 300 });
      await approveLedgerEntry(deposit.id, societyId, adminId);

      const balances = await computeFlatBalances(flatId);
      expect(balances.approvedDeposits).toBeGreaterThanOrEqual(300);
    });

    it('returns 409-worthy error on a second review of the same entry', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 100 });
      await approveLedgerEntry(deposit.id, societyId, adminId);
      await expect(approveLedgerEntry(deposit.id, societyId, adminId)).rejects.toThrow(
        LedgerEntryAlreadyReviewedError,
      );
    });

    it('rejecting a deposit stores the reason and never moves the balance', async () => {
      const before = await computeFlatBalances(flatId);
      const deposit = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 50 });
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

    it('accepts locking an amount above the current outstanding — no longer capped (2026-08-20 pivot)', async () => {
      const balances = await computeFlatBalances(flatId);
      const intent = await createOrReplacePaymentIntent(
        flatId,
        ownerId,
        societyId,
        balances.outstanding + 1,
      );
      expect(intent.amount).toBe(balances.outstanding + 1);
      await cancelPaymentIntent(flatId, societyId);
    });

    it('creates an intent, replaces it on a second lock, and cancel clears it', async () => {
      const first = await createOrReplacePaymentIntent(flatId, ownerId, societyId, 10);
      expect(first.amount).toBe(10);
      expect(first.paymentMethod).toBe('UPI');
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
      await expect(submitPaymentIntent(flatId, ownerId, societyId, 'OWNER', fakeProofFile)).rejects.toThrow(
        NoOpenPaymentIntentError,
      );
    });

    it('submitPaymentIntent finalizes into a PENDING deposit and clears the intent', async () => {
      await createOrReplacePaymentIntent(flatId, ownerId, societyId, 15);
      const entry = await submitPaymentIntent(flatId, ownerId, societyId, 'OWNER', fakeProofFile);
      expect((entry as { status: string }).status).toBe('PENDING');
      expect((entry as { fileUrl: string | null }).fileUrl).not.toBeNull();
      expect(await getOpenPaymentIntent(flatId, societyId)).toBeNull();
    });
  });

  // docs/other-charges/ — a resident has at most one open intent at a time, across
  // BOTH pools. Same-category replace still works (already covered above); a
  // DIFFERENT category is blocked, not silently replaced.
  describe('payment intents — one at a time across pools (docs/other-charges/)', () => {
    it('replacing an intent for the SAME category still works unchanged', async () => {
      await createOrReplacePaymentIntent(flatId, ownerId, societyId, 10, 'MAINTENANCE');
      const replaced = await createOrReplacePaymentIntent(flatId, ownerId, societyId, 25, 'MAINTENANCE');
      expect(replaced.amount).toBe(25);
      expect(replaced.category).toBe('MAINTENANCE');
      await cancelPaymentIntent(flatId, societyId);
    });

    it('locking a MAINTENANCE intent while an OTHER_CHARGE one is open is blocked, not replaced', async () => {
      const feeType = await createFeeType(societyId, adminId, {
        name: `Intent Block Fee ${Date.now()}`,
      });
      await billOtherCharge(societyId, adminId, { flatId, feeTypeId: feeType.id, amount: 500 });

      const otherChargeIntent = await createOrReplacePaymentIntent(
        flatId,
        ownerId,
        societyId,
        100,
        'OTHER_CHARGE',
      );
      expect(otherChargeIntent.category).toBe('OTHER_CHARGE');

      await expect(
        createOrReplacePaymentIntent(flatId, ownerId, societyId, 10, 'MAINTENANCE'),
      ).rejects.toThrow(IntentAlreadyOpenForOtherCategoryError);

      // The original OTHER_CHARGE intent is untouched — never silently replaced.
      const stillOpen = await getOpenPaymentIntent(flatId, societyId);
      expect(stillOpen?.category).toBe('OTHER_CHARGE');
      expect(stillOpen?.amount).toBe(100);

      await cancelPaymentIntent(flatId, societyId);
    });
  });

  describe('payment method selection (UPI vs bank transfer)', () => {
    const methodSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let methodSocietyId: string;
    let methodFlatId: string;
    let methodOwnerId: string;
    const methodFlatIds: string[] = [];

    beforeAll(async () => {
      const society = await prisma.society.create({
        data: { name: `Payment Method Society ${methodSuffix}`, address: '1 Test St' },
      });
      methodSocietyId = society.id;

      const flat = await createFlat({
        societyId: methodSocietyId,
        wing: 'M',
        flatNumber: '101',
        baseRate: 1000,
        ownerName: 'Method Owner',
        ownerEmail: `method-owner-${methodSuffix}@example.com`,
      });
      methodFlatId = flat!.id;
      methodOwnerId = flat!.ownerId;
      methodFlatIds.push(methodFlatId);

      await prisma.maintenanceRecord.create({
        data: {
          flatId: methodFlatId,
          period: '2026-01',
          payerType: 'OWNER',
          amount: 1000,
          dueDate: new Date('2026-01-15'),
          payerId: methodOwnerId,
        },
      });
    });

    afterAll(async () => {
      await prisma.paymentIntent.deleteMany({ where: { flatId: { in: methodFlatIds } } });
      await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: methodFlatIds } } });
      await prisma.flat.deleteMany({ where: { id: { in: methodFlatIds } } });
      const userIds = await prisma.user
        .findMany({ where: { societyId: methodSocietyId }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.society.delete({ where: { id: methodSocietyId } });
    });

    it('uses UPI when both UPI and bank details are configured — UPI takes precedence', async () => {
      await prisma.society.update({
        where: { id: methodSocietyId },
        data: {
          upiVpa: 'method-test@okhdfcbank',
          bankAccountNumber: '123456789012',
          bankIfsc: 'HDFC0001234',
        },
      });
      const intent = await createOrReplacePaymentIntent(
        methodFlatId,
        methodOwnerId,
        methodSocietyId,
        10,
      );
      expect(intent.paymentMethod).toBe('UPI');
      expect(intent.upiLink).toContain('upi://pay');
      expect(intent.qrDataUrl).toContain('data:image/png;base64,');
      expect(intent.bankAccountNumber).toBeUndefined();
      expect(intent.bankIfsc).toBeUndefined();
    });

    it('falls back to bank transfer details when no UPI VPA is configured', async () => {
      await prisma.society.update({
        where: { id: methodSocietyId },
        data: { upiVpa: null, bankAccountNumber: '123456789012', bankIfsc: 'HDFC0001234' },
      });
      const intent = await createOrReplacePaymentIntent(
        methodFlatId,
        methodOwnerId,
        methodSocietyId,
        10,
      );
      expect(intent.paymentMethod).toBe('BANK_TRANSFER');
      expect(intent.bankAccountNumber).toBe('123456789012');
      expect(intent.bankIfsc).toBe('HDFC0001234');
      expect(intent.upiLink).toBeUndefined();
      expect(intent.qrDataUrl).toBeUndefined();
    });

    it('throws PaymentMethodNotConfiguredError when neither UPI nor complete bank details are set', async () => {
      await prisma.society.update({
        where: { id: methodSocietyId },
        data: { upiVpa: null, bankAccountNumber: null, bankIfsc: null },
      });
      await expect(
        createOrReplacePaymentIntent(methodFlatId, methodOwnerId, methodSocietyId, 10),
      ).rejects.toThrow(PaymentMethodNotConfiguredError);
    });
  });

  describe('getLedgerForResident', () => {
    it('merges SYSTEM charges with LedgerEntry (Deposit) rows and includes the running totals', async () => {
      const ledger = await getLedgerForResident(flatId);
      expect(ledger.entries.some((e) => e.type === 'SYSTEM')).toBe(true);
      expect(ledger.entries.some((e) => e.type === 'DEPOSIT')).toBe(true);
      expect(ledger.totals.totalCharges).toBe(2000);
      expect(ledger.availableYears).toContain(2026);
    });

    it('scopes entries and yearTotals to the given year; totals/availableYears stay lifetime regardless', async () => {
      const allTime = await getLedgerForResident(flatId);
      const scoped = await getLedgerForResident(flatId, 'MAINTENANCE', 2026);
      expect(scoped.yearTotals.totalCharges).toBe(2000);
      expect(scoped.entries.every((e) => e.type !== 'SYSTEM' || e.period?.startsWith('2026'))).toBe(
        true,
      );
      expect(scoped.availableYears).toEqual(allTime.availableYears);
      // Outstanding is current financial state, not a per-year concept — it must be
      // identical (lifetime) no matter which year is asked for.
      expect(scoped.totals).toEqual(allTime.totals);

      const otherYear = await getLedgerForResident(flatId, 'MAINTENANCE', 1999);
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

    it('filters by category', async () => {
      const entries = await listPendingLedgerEntries(societyId, { category: 'MAINTENANCE' });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.category === 'MAINTENANCE')).toBe(true);
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
        data: {
          name: `Other Society 2 ${suffix}`,
          address: '3 Test St',
          upiVpa: 'other2@okhdfcbank',
        },
      });
      const result = await manualDeposit(otherSociety.id, adminId, flatId, 100);
      expect(result).toBeNull();
      await prisma.society.delete({ where: { id: otherSociety.id } });
    });
  });

  describe('getLedgerEntryFileForViewing', () => {
    it('returns null when the entry has no file attached', async () => {
      const deposit = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 10 });
      const result = await getLedgerEntryFileForViewing(deposit.id, ownerId, 'OWNER', societyId);
      expect(result).toBeNull();
    });
  });
});
