import { PDFParse } from 'pdf-parse';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { getStorageAdapter } from '../../../src/infrastructure/storage';
import { approveLedgerEntry, manualDeposit } from '../../../src/features/ledger/admin/admin-ledger-service';
import { createDeposit } from '../../../src/features/ledger/resident/resident-ledger-service';
import { createFlat } from '../../../src/features/flats/admin/admin-flats-onboarding-service';
import { createFeeType } from '../../../src/features/fee-types/fee-types.service';
import { billOtherCharge } from '../../../src/features/other-charges/other-charges.service';
import {
  buildReceiptData,
  buildReceiptNumber,
  getIssuedReceiptForViewing,
  getSignatureBufferOrUndefined,
  previewReceiptPdf,
} from '../../../src/features/receipts/receipt.service';
import {
  LedgerEntryAlreadyReviewedError,
  ForbiddenLedgerEntryAccessError,
} from '../../../src/shared/errors/errors';

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('receipt service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let flatId: string;
  let ownerId: string;
  let adminId: string;
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Receipt Test Society ${suffix}`,
        address: '42 Receipt Lane, Pune',
        upiVpa: 'receipt-test@okhdfcbank',
      },
    });
    societyId = society.id;

    // Chairman/Secretary sign every receipt (2026-08-17) — set both up so the
    // receipt-rendering tests below exercise the real committee-lookup path, not
    // just the "role unassigned" fallback.
    const chairman = await prisma.user.create({
      data: {
        name: 'Ramesh Kulkarni',
        email: `receipt-chairman-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'OWNER',
        societyId,
      },
    });
    const secretary = await prisma.user.create({
      data: {
        name: 'Sunita Deshmukh',
        email: `receipt-secretary-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'OWNER',
        societyId,
      },
    });
    await prisma.society.update({
      where: { id: societyId },
      data: { chairmanId: chairman.id, secretaryId: secretary.id },
    });

    const flat = await createFlat({
      societyId,
      wing: 'R',
      flatNumber: '101',
      baseRate: 1000,
      ownerName: 'Receipt Owner',
      ownerEmail: `receipt-owner-${suffix}@example.com`,
    });
    flatId = flat!.id;
    ownerId = flat!.ownerId;
    createdFlatIds.push(flatId);

    const admin = await prisma.user.create({
      data: {
        name: 'Receipt Admin',
        email: `receipt-admin-${suffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;

    await prisma.maintenanceRecord.create({
      data: {
        flatId,
        period: '2026-01',
        payerType: 'OWNER',
        amount: 1000,
        dueDate: new Date('2026-01-15'),
        payerId: ownerId,
      },
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

  describe('buildReceiptNumber', () => {
    it('combines the prefix, flat wing+number, and ledger entry id', () => {
      expect(buildReceiptNumber('RCPT', { wing: 'A', flatNumber: '101' }, 'entry123')).toBe(
        'RCPT-A101-entry123',
      );
    });
  });

  describe('buildReceiptData', () => {
    const flat = { wing: 'A', flatNumber: '101' };
    const payer = { name: 'Priya Nair' };
    const society = {
      id: 'soc1',
      name: 'Sunrise Residency',
      address: '1 Garden Rd',
      receiptNumberPrefix: 'RCPT',
      receiptFooterNote: null,
      chairman: null,
      secretary: null,
      chairmanSignatureFileKey: null,
      secretarySignatureFileKey: null,
    };

    it('uses the generic "Maintenance dues payment" purpose for a Deposit', () => {
      const entry = {
        id: 'e1',
        amount: 1500,
        note: null,
        payerId: 'p1',
        category: 'MAINTENANCE' as const,
      };
      const data = buildReceiptData(entry, flat, payer, society, { date: new Date('2026-08-11') });
      expect(data.purpose).toBe('Maintenance dues payment');
      expect(data.amount).toBe(1500);
    });

    it('uses the "Other charges payment" purpose for an OTHER_CHARGE category entry with no fee type names supplied (legacy, never backfilled)', () => {
      const entry = {
        id: 'e2',
        amount: 800,
        note: null,
        payerId: 'p1',
        category: 'OTHER_CHARGE' as const,
      };
      const data = buildReceiptData(entry, flat, payer, society, { date: new Date('2026-08-11') });
      expect(data.purpose).toBe('Other charges payment');
    });

    // 2026-08-24 addition — see OtherCharge.settledByLedgerEntryId's schema comment.
    it('folds a single supplied fee type name into the purpose line', () => {
      const entry = {
        id: 'e3',
        amount: 500,
        note: null,
        payerId: 'p1',
        category: 'OTHER_CHARGE' as const,
      };
      const data = buildReceiptData(entry, flat, payer, society, {
        date: new Date('2026-08-24'),
        otherChargeFeeTypeNames: ['Transfer Fee'],
      });
      expect(data.purpose).toBe('Transfer Fee payment');
    });

    it('joins multiple supplied fee type names into one purpose line', () => {
      const entry = {
        id: 'e4',
        amount: 900,
        note: null,
        payerId: 'p1',
        category: 'OTHER_CHARGE' as const,
      };
      const data = buildReceiptData(entry, flat, payer, society, {
        date: new Date('2026-08-24'),
        otherChargeFeeTypeNames: ['Transfer Fee', 'Parking Fine'],
      });
      expect(data.purpose).toBe('Transfer Fee, Parking Fine payment');
    });

    it('a MAINTENANCE entry ignores otherChargeFeeTypeNames entirely, even if supplied', () => {
      const entry = {
        id: 'e5',
        amount: 1200,
        note: null,
        payerId: 'p1',
        category: 'MAINTENANCE' as const,
      };
      const data = buildReceiptData(entry, flat, payer, society, {
        date: new Date('2026-08-24'),
        otherChargeFeeTypeNames: ['Transfer Fee'],
      });
      expect(data.purpose).toBe('Maintenance dues payment');
    });
  });

  describe('getSignatureBufferOrUndefined', () => {
    it('returns undefined when no signature file key is set', async () => {
      const buffer = await getSignatureBufferOrUndefined(null);
      expect(buffer).toBeUndefined();
    });

    it('falls back to undefined (does not throw) when the stored key cannot be read', async () => {
      const buffer = await getSignatureBufferOrUndefined('nonexistent/key.png');
      expect(buffer).toBeUndefined();
    });

    it('reads the actual bytes when the key is valid', async () => {
      const { key } = await getStorageAdapter().save({
        buffer: Buffer.from('fake-png-bytes'),
        societyId,
        extension: '.png',
      });
      const buffer = await getSignatureBufferOrUndefined(key);
      expect(buffer?.toString()).toBe('fake-png-bytes');
    });
  });

  describe('previewReceiptPdf', () => {
    it('returns null for a nonexistent entry', async () => {
      expect(await previewReceiptPdf('nonexistent-id', societyId)).toBeNull();
    });

    it('renders a preview PDF for a PENDING deposit, with no side effects', async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 500 });
      const before = await prisma.receipt.count({
        where: { ledgerEntryId: (entry as { id: string }).id },
      });

      const buffer = await previewReceiptPdf((entry as { id: string }).id, societyId);
      expect(buffer).not.toBeNull();
      const text = await extractText(buffer!);
      expect(text).toContain('Maintenance dues payment');
      expect(text).toContain('R-101');
      // Chairman and Secretary sign every receipt now (2026-08-17), not a single
      // treasurer signatory — see CLAUDE.md's addendum.
      expect(text).toContain('Ramesh Kulkarni');
      expect(text).toContain('Chairman');
      expect(text).toContain('Sunita Deshmukh');
      expect(text).toContain('Secretary');

      const after = await prisma.receipt.count({
        where: { ledgerEntryId: (entry as { id: string }).id },
      });
      expect(after).toBe(before); // no Receipt row created by preview
    });

    it('throws LedgerEntryAlreadyReviewedError for a non-PENDING entry', async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 300 });
      const approved = await approveLedgerEntry((entry as { id: string }).id, societyId, adminId);
      await expect(previewReceiptPdf(approved!.id, societyId)).rejects.toThrow(
        LedgerEntryAlreadyReviewedError,
      );
    });

    // 2026-08-24 addition — end-to-end: the actual rendered PDF text for an Other
    // Charges receipt now names the real fee type, not the generic label, and the
    // preview (before approval) and the issued receipt (after) agree exactly.
    it('an OTHER_CHARGE receipt names the real fee type in the PDF, not the generic label', async () => {
      const feeType = await createFeeType(societyId, adminId, { name: `Transfer Fee ${Date.now()}` });
      await billOtherCharge(societyId, adminId, { flatId, feeTypeId: feeType.id, amount: 650 });
      const deposit = await createDeposit(
        ownerId,
        flatId,
        societyId,
        'OWNER',
        { amount: 650 },
        'OTHER_CHARGE',
      );
      const entryId = (deposit as { id: string }).id;

      const previewBuffer = await previewReceiptPdf(entryId, societyId);
      const previewText = await extractText(previewBuffer!);
      expect(previewText).toContain(`${feeType.name} payment`);
      expect(previewText).not.toContain('Other charges payment');

      await approveLedgerEntry(entryId, societyId, adminId);
      const issued = await getIssuedReceiptForViewing(entryId, adminId, 'ADMIN', societyId);
      const issuedText = await extractText(await streamToBuffer(issued!.stream));
      expect(issuedText).toContain(`${feeType.name} payment`);
    });

    it('preview and the eventually-issued receipt number match exactly (determinism)', async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 250 });
      const entryId = (entry as { id: string }).id;

      const previewBuffer = await previewReceiptPdf(entryId, societyId);
      const previewText = await extractText(previewBuffer!);
      const expectedNumber = buildReceiptNumber('RCPT', { wing: 'R', flatNumber: '101' }, entryId);
      expect(previewText).toContain(expectedNumber);

      await approveLedgerEntry(entryId, societyId, adminId);
      const receipt = await prisma.receipt.findUnique({ where: { ledgerEntryId: entryId } });
      expect(receipt!.receiptNumber).toBe(expectedNumber);
    });
  });

  describe('getIssuedReceiptForViewing', () => {
    it('returns null when no Receipt row exists yet (e.g. still PENDING)', async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 100 });
      const result = await getIssuedReceiptForViewing(
        (entry as { id: string }).id,
        ownerId,
        'OWNER',
        societyId,
      );
      expect(result).toBeNull();
    });

    it("lets the entry's own payer download their issued receipt", async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 150 });
      const entryId = (entry as { id: string }).id;
      await approveLedgerEntry(entryId, societyId, adminId);

      const result = await getIssuedReceiptForViewing(entryId, ownerId, 'OWNER', societyId);
      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('application/pdf');
      const buffer = await streamToBuffer(result!.stream);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('lets an admin download any receipt in their society', async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 175 });
      const entryId = (entry as { id: string }).id;
      await approveLedgerEntry(entryId, societyId, adminId);

      const result = await getIssuedReceiptForViewing(entryId, adminId, 'ADMIN', societyId);
      expect(result).not.toBeNull();
    });

    it('throws ForbiddenLedgerEntryAccessError for a different resident', async () => {
      const entry = await createDeposit(ownerId, flatId, societyId, 'OWNER', { amount: 125 });
      const entryId = (entry as { id: string }).id;
      await approveLedgerEntry(entryId, societyId, adminId);

      await expect(
        getIssuedReceiptForViewing(entryId, 'someone-else-id', 'OWNER', societyId),
      ).rejects.toThrow(ForbiddenLedgerEntryAccessError);
    });
  });
});
