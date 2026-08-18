import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import {
  approveLedgerEntry,
  balancesFromRows,
  cancelPaymentIntent,
  computeFlatBalances,
  computeRecordSettlements,
  createCredit,
  createDeposit,
  createOrReplacePaymentIntent,
  getLedgerEntryFileForViewing,
  getLedgerForResident,
  getOpenPaymentIntent,
  InvalidAmountError,
  InvalidDepositAmountError,
  LedgerEntryAlreadyReviewedError,
  listPendingLedgerEntries,
  manualDeposit,
  NoOpenPaymentIntentError,
  PaymentMethodNotConfiguredError,
  rejectLedgerEntry,
  submitPaymentIntent,
} from '../../../src/features/ledger/ledger.service';

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
  // 1-9; Case 10 — reject overpayment — is already covered by the createDeposit/
  // createOrReplacePaymentIntent InvalidDepositAmountError tests, since amount
  // validation is unchanged by this feature).
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

  // Pure-function coverage of the credit-allocation spec's 10 worked cases —
  // balancesFromRows (approvedCredits/availableCredit) combined with
  // computeRecordSettlements fed the deposits+credits lump sum, exactly as
  // getLedgerForResident/admin-dashboard.service.ts actually call them. No DB
  // involved; createCredit/approveLedgerEntry's DB-integration behavior is covered
  // separately below.
  describe('credit allocation (balancesFromRows + computeRecordSettlements combined)', () => {
    const jun = { id: 'jun', period: '2026-06', amount: 800 };
    const jul = { id: 'jul', period: '2026-07', amount: 800 };
    const aug = { id: 'aug', period: '2026-08', amount: 800 };

    function run(
      records: { id: string; period: string; amount: number }[],
      entries: {
        type: 'DEPOSIT' | 'CREDIT';
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        amount: number;
      }[],
    ) {
      const balances = balancesFromRows(records, entries);
      const settlements = computeRecordSettlements(
        records,
        balances.approvedDeposits + balances.approvedCredits,
      );
      return { balances, settlements };
    }

    it('Case 1: credit smaller than a single outstanding record', () => {
      const { balances, settlements } = run(
        [jun],
        [{ type: 'CREDIT', status: 'APPROVED', amount: 550 }],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 550, status: 'PARTIALLY_SETTLED' });
      expect(balances.outstanding).toBe(250);
      expect(balances.availableCredit).toBe(0);
    });

    it('Case 2: credit larger than total outstanding — leftover becomes Available Credit', () => {
      const { balances, settlements } = run(
        [jun],
        [{ type: 'CREDIT', status: 'APPROVED', amount: 1200 }],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(balances.outstanding).toBe(0);
      expect(balances.availableCredit).toBe(400);
    });

    it('Case 3: credit exactly equals the outstanding amount', () => {
      const { balances, settlements } = run(
        [jun],
        [{ type: 'CREDIT', status: 'APPROVED', amount: 800 }],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(balances.outstanding).toBe(0);
      expect(balances.availableCredit).toBe(0);
    });

    it('Case 4: credit spans two records — one full, one partial', () => {
      const { balances, settlements } = run(
        [jun, jul],
        [{ type: 'CREDIT', status: 'APPROVED', amount: 1000 }],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(settlements.get('jul')).toEqual({ settledAmount: 200, status: 'PARTIALLY_SETTLED' });
      expect(balances.outstanding).toBe(600);
      expect(balances.availableCredit).toBe(0);
    });

    it('Case 5: credit approved when there are no open dues at all — entire amount becomes Available Credit', () => {
      const { balances, settlements } = run(
        [jun],
        [
          { type: 'DEPOSIT', status: 'APPROVED', amount: 800 },
          { type: 'CREDIT', status: 'APPROVED', amount: 550 },
        ],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(balances.outstanding).toBe(0);
      expect(balances.availableCredit).toBe(550);
    });

    it('Case 6: a still-pending credit has zero effect on any balance', () => {
      const { balances, settlements } = run(
        [jun],
        [{ type: 'CREDIT', status: 'PENDING', amount: 550 }],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 0, status: 'UNPAID' });
      expect(balances.outstanding).toBe(800);
      expect(balances.availableCredit).toBe(0);
    });

    it('Case 7: multiple credits approved separately apply cumulatively', () => {
      const { balances, settlements } = run(
        [jun],
        [
          { type: 'CREDIT', status: 'APPROVED', amount: 300 },
          { type: 'CREDIT', status: 'APPROVED', amount: 250 },
        ],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 550, status: 'PARTIALLY_SETTLED' });
      expect(balances.outstanding).toBe(250);
      expect(balances.availableCredit).toBe(0);
    });

    it('Case 8: existing pending dues get immediate benefit from newly approved credit', () => {
      const { balances, settlements } = run(
        [jun, jul],
        [{ type: 'CREDIT', status: 'APPROVED', amount: 550 }],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 550, status: 'PARTIALLY_SETTLED' });
      expect(settlements.get('jul')).toEqual({ settledAmount: 0, status: 'UNPAID' });
      expect(balances.outstanding).toBe(1050);
    });

    it('Case 9: Available Credit is automatically consumed when a new due is generated — no special "consumption" code needed, just rerunning the same fill against a larger record set', () => {
      const entries: { type: 'DEPOSIT' | 'CREDIT'; status: 'APPROVED'; amount: number }[] = [
        { type: 'CREDIT', status: 'APPROVED', amount: 1200 },
      ];
      const before = run([jun], entries);
      expect(before.balances.outstanding).toBe(0);
      expect(before.balances.availableCredit).toBe(400);

      // Aug is generated later — same entries, one more record.
      const after = run([jun, aug], entries);
      expect(after.settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(after.settlements.get('aug')).toEqual({
        settledAmount: 400,
        status: 'PARTIALLY_SETTLED',
      });
      expect(after.balances.outstanding).toBe(400);
      expect(after.balances.availableCredit).toBe(0);
    });

    it('Case 10: credit combined with a partially-settled record from a prior payment — sources are just added together', () => {
      const { balances, settlements } = run(
        [jun],
        [
          { type: 'DEPOSIT', status: 'APPROVED', amount: 300 },
          { type: 'CREDIT', status: 'APPROVED', amount: 500 },
        ],
      );
      expect(settlements.get('jun')).toEqual({ settledAmount: 800, status: 'PAID' });
      expect(balances.outstanding).toBe(0);
      expect(balances.availableCredit).toBe(0);
    });
  });

  describe('createDeposit', () => {
    it('rejects an amount of 0 or less', async () => {
      await expect(createDeposit(ownerId, flatId, societyId, { amount: 0 })).rejects.toThrow(
        InvalidDepositAmountError,
      );
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

    it('logs APPROVE_CREDIT/REJECT_CREDIT distinctly from the Deposit action names', async () => {
      const approved = await createCredit(ownerId, flatId, societyId, {
        amount: 60,
        note: 'Approved-credit audit check',
        file: fakeProofFile,
      });
      await approveLedgerEntry(approved.id, societyId, adminId);
      const approveLog = await prisma.auditLog.findFirst({
        where: { entityId: approved.id, entityType: 'LedgerEntry' },
        orderBy: { createdAt: 'desc' },
      });
      expect(approveLog?.action).toBe('APPROVE_CREDIT');

      const rejected = await createCredit(ownerId, flatId, societyId, {
        amount: 60,
        note: 'Rejected-credit audit check',
        file: fakeProofFile,
      });
      await rejectLedgerEntry(rejected.id, societyId, adminId, 'not enough context');
      const rejectLog = await prisma.auditLog.findFirst({
        where: { entityId: rejected.id, entityType: 'LedgerEntry' },
        orderBy: { createdAt: 'desc' },
      });
      expect(rejectLog?.action).toBe('REJECT_CREDIT');
    });
  });

  describe('createCredit', () => {
    it('rejects an amount of 0 or less', async () => {
      await expect(
        createCredit(ownerId, flatId, societyId, { amount: 0, note: 'x', file: fakeProofFile }),
      ).rejects.toThrow(InvalidAmountError);
    });

    it('allows an amount that exceeds the current Outstanding — unlike a Deposit, Credit is never capped', async () => {
      const balances = await computeFlatBalances(flatId);
      const credit = await createCredit(ownerId, flatId, societyId, {
        amount: balances.outstanding + 10_000,
        note: 'Large repair reimbursement, exceeds Outstanding on purpose',
        file: fakeProofFile,
      });
      expect(credit.status).toBe('PENDING');
      expect(credit.type).toBe('CREDIT');
      expect(Number(credit.amount)).toBe(balances.outstanding + 10_000);
    });

    it("requires a proof attachment, same as it requires a note — saved via the storage adapter like a Deposit's screenshot", async () => {
      const credit = await createCredit(ownerId, flatId, societyId, {
        amount: 40,
        note: 'Receipt attached',
        file: fakeProofFile,
      });
      expect(credit.fileUrl).not.toBeNull();
      expect(credit.mimeType).toBe('image/png');
    });

    it('a PENDING credit has zero effect on Outstanding or Available Credit until approved', async () => {
      const before = await computeFlatBalances(flatId);
      await createCredit(ownerId, flatId, societyId, {
        amount: 500,
        note: 'Still pending, must not move anything',
        file: fakeProofFile,
      });

      const after = await computeFlatBalances(flatId);
      expect(after.outstanding).toBe(before.outstanding);
      expect(after.availableCredit).toBe(before.availableCredit);
      expect(after.approvedCredits).toBe(before.approvedCredits);
    });

    it('approving a credit increases approvedCredits by exactly its amount', async () => {
      const before = await computeFlatBalances(flatId);
      const credit = await createCredit(ownerId, flatId, societyId, {
        amount: 150,
        note: 'Common-area repair',
        file: fakeProofFile,
      });
      await approveLedgerEntry(credit.id, societyId, adminId);

      const after = await computeFlatBalances(flatId);
      expect(after.approvedCredits).toBe(before.approvedCredits + 150);
    });

    it('rejecting a credit stores the reason and never moves any balance', async () => {
      const before = await computeFlatBalances(flatId);
      const credit = await createCredit(ownerId, flatId, societyId, {
        amount: 75,
        note: 'Disputed reimbursement',
        file: fakeProofFile,
      });
      const rejected = await rejectLedgerEntry(
        credit.id,
        societyId,
        adminId,
        'insufficient documentation',
      );
      expect(rejected!.status).toBe('REJECTED');
      expect(rejected!.adminNote).toBe('insufficient documentation');

      const after = await computeFlatBalances(flatId);
      expect(after.outstanding).toBe(before.outstanding);
      expect(after.approvedCredits).toBe(before.approvedCredits);
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
    it('merges SYSTEM charges with LedgerEntry rows (Deposit and Credit) and includes the running totals', async () => {
      const ledger = await getLedgerForResident(flatId);
      expect(ledger.entries.some((e) => e.type === 'SYSTEM')).toBe(true);
      expect(ledger.entries.some((e) => e.type === 'DEPOSIT')).toBe(true);
      expect(ledger.entries.some((e) => e.type === 'CREDIT')).toBe(true);
      expect(ledger.totals.totalCharges).toBe(2000);
      expect(ledger.availableYears).toContain(2026);
    });

    it('scopes entries and yearTotals to the given year; totals/availableYears stay lifetime regardless', async () => {
      const allTime = await getLedgerForResident(flatId);
      const scoped = await getLedgerForResident(flatId, 2026);
      expect(scoped.yearTotals.totalCharges).toBe(2000);
      expect(scoped.entries.every((e) => e.type !== 'SYSTEM' || e.period?.startsWith('2026'))).toBe(
        true,
      );
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

    it('filters by type', async () => {
      const credits = await listPendingLedgerEntries(societyId, { type: 'CREDIT' });
      expect(credits.length).toBeGreaterThan(0);
      expect(credits.every((e) => e.type === 'CREDIT')).toBe(true);

      const deposits = await listPendingLedgerEntries(societyId, { type: 'DEPOSIT' });
      expect(deposits.length).toBeGreaterThan(0);
      expect(deposits.every((e) => e.type === 'DEPOSIT')).toBe(true);
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
      const deposit = await createDeposit(ownerId, flatId, societyId, { amount: 10 });
      const result = await getLedgerEntryFileForViewing(deposit.id, ownerId, 'OWNER', societyId);
      expect(result).toBeNull();
    });
  });
});
