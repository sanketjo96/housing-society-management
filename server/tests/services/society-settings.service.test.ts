import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { getStorageAdapter } from '../../src/lib/storage';
import {
  getReceiptSignatureForViewing,
  getSocietySettings,
  IncompleteBankDetailsError,
  InvalidCommitteeMemberError,
  removeReceiptSignature,
  setReceiptSignature,
  updateSocietySettings,
} from '../../src/services/society-settings.service';

// LocalStorageAdapter.read() resolves synchronously with a stream — a missing
// file only surfaces as an 'error' event once the stream is actually consumed,
// not as a rejected promise from read() itself.
async function expectFileGone(key: string): Promise<void> {
  const stream = await getStorageAdapter().read(key);
  await expect(
    new Promise((resolve, reject) => {
      stream.on('data', () => {});
      stream.on('end', resolve);
      stream.on('error', reject);
    }),
  ).rejects.toThrow();
}

describe('society-settings service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let ownerId: string;
  let otherSocietyId: string;
  let otherSocietyOwnerId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Settings Test Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'settings-test@okhdfcbank',
        tenantRateFactor: 1.5,
        defaultBaseRate: 1500,
      },
    });
    societyId = society.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Priya Owner',
        email: `priya-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId,
      },
    });
    ownerId = owner.id;

    // A different society's owner — used to prove committee validation is
    // society-scoped, not just "any OWNER anywhere".
    const otherSociety = await prisma.society.create({
      data: { name: `Other Society ${suffix}`, address: '2 Other St' },
    });
    otherSocietyId = otherSociety.id;
    const otherOwner = await prisma.user.create({
      data: {
        name: 'Other Owner',
        email: `other-owner-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'OWNER',
        societyId: otherSociety.id,
      },
    });
    otherSocietyOwnerId = otherOwner.id;
  });

  afterAll(async () => {
    await prisma.society.update({
      where: { id: societyId },
      data: { chairmanId: null, secretaryId: null, treasurerId: null },
    });
    await prisma.user.delete({ where: { id: otherSocietyOwnerId } });
    await prisma.society.delete({ where: { id: otherSocietyId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('returns the current settings, with default receiptNumberPrefix and no signature', async () => {
    const settings = await getSocietySettings(societyId);
    expect(settings).toEqual({
      name: `Settings Test Society ${suffix}`,
      address: '1 Test St',
      constructionDate: null,
      formationDate: null,
      upiVpa: 'settings-test@okhdfcbank',
      bankAccountNumber: null,
      bankIfsc: null,
      tenantRateFactor: 1.5,
      defaultBaseRate: 1500,
      receiptNumberPrefix: 'RCPT',
      receiptSignatoryName: null,
      receiptSignatoryTitle: null,
      receiptFooterNote: null,
      hasSignature: false,
      chairman: null,
      secretary: null,
      treasurer: null,
    });
  });

  it('updates tenantRateFactor only, leaving everything else untouched', async () => {
    const updated = await updateSocietySettings(societyId, { tenantRateFactor: 1.75 });
    expect(updated.tenantRateFactor).toBe(1.75);
    expect(updated.defaultBaseRate).toBe(1500);
  });

  it('updates defaultBaseRate only, leaving everything else untouched', async () => {
    const updated = await updateSocietySettings(societyId, { defaultBaseRate: 1800 });
    expect(updated.defaultBaseRate).toBe(1800);
    expect(updated.tenantRateFactor).toBe(1.75);
  });

  it('updates constructionDate and formationDate', async () => {
    const updated = await updateSocietySettings(societyId, {
      constructionDate: '1998-04-12',
      formationDate: '1999-01-20',
    });
    expect(updated.constructionDate).toBe('1998-04-12');
    expect(updated.formationDate).toBe('1999-01-20');
  });

  it('updates the society name, address, and UPI ID', async () => {
    const updated = await updateSocietySettings(societyId, {
      name: 'Renamed Society',
      address: '2 New Address Rd',
      upiVpa: 'renamed-society@upi',
    });
    expect(updated.name).toBe('Renamed Society');
    expect(updated.address).toBe('2 New Address Rd');
    expect(updated.upiVpa).toBe('renamed-society@upi');
    expect(updated.defaultBaseRate).toBe(1800);
    expect(updated.tenantRateFactor).toBe(1.75);
  });

  it('sets a complete bank account number + IFSC pair', async () => {
    const updated = await updateSocietySettings(societyId, {
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
    });
    expect(updated.bankAccountNumber).toBe('123456789012');
    expect(updated.bankIfsc).toBe('HDFC0001234');
  });

  it('rejects setting only one of bankAccountNumber/bankIfsc when the other is unset', async () => {
    await updateSocietySettings(societyId, { bankAccountNumber: '', bankIfsc: '' });
    await expect(updateSocietySettings(societyId, { bankAccountNumber: '123456789012' })).rejects.toThrow(
      IncompleteBankDetailsError,
    );
  });

  it('rejects clearing just one side of an already-complete pair', async () => {
    await updateSocietySettings(societyId, { bankAccountNumber: '123456789012', bankIfsc: 'HDFC0001234' });
    await expect(updateSocietySettings(societyId, { bankIfsc: '' })).rejects.toThrow(IncompleteBankDetailsError);
    // Neither field was actually touched by the rejected request.
    const settings = await getSocietySettings(societyId);
    expect(settings.bankAccountNumber).toBe('123456789012');
    expect(settings.bankIfsc).toBe('HDFC0001234');
  });

  it('clears the UPI VPA back to null when given an empty string', async () => {
    const updated = await updateSocietySettings(societyId, { upiVpa: '' });
    expect(updated.upiVpa).toBeNull();
  });

  it('updates the receipt template fields', async () => {
    const updated = await updateSocietySettings(societyId, {
      receiptNumberPrefix: 'SR',
      receiptSignatoryName: 'Ramesh Kulkarni',
      receiptSignatoryTitle: 'Treasurer',
      receiptFooterNote: 'Thank you for your prompt payment.',
    });
    expect(updated.receiptNumberPrefix).toBe('SR');
    expect(updated.receiptSignatoryName).toBe('Ramesh Kulkarni');
    expect(updated.receiptSignatoryTitle).toBe('Treasurer');
    expect(updated.receiptFooterNote).toBe('Thank you for your prompt payment.');
  });

  it('clears a receipt text field back to null when given an empty string', async () => {
    const updated = await updateSocietySettings(societyId, { receiptFooterNote: '' });
    expect(updated.receiptFooterNote).toBeNull();
    // Unrelated receipt fields stay untouched.
    expect(updated.receiptSignatoryName).toBe('Ramesh Kulkarni');
  });

  describe('committee roles', () => {
    it('assigns an owner as chairman', async () => {
      const updated = await updateSocietySettings(societyId, { chairmanId: ownerId });
      expect(updated.chairman).toEqual({
        id: ownerId,
        name: 'Priya Owner',
        email: `priya-owner-${suffix}@example.com`,
        phone: null,
      });
      expect(updated.secretary).toBeNull();
      expect(updated.treasurer).toBeNull();
    });

    it('assigns the same owner to multiple roles independently', async () => {
      const updated = await updateSocietySettings(societyId, { secretaryId: ownerId, treasurerId: ownerId });
      expect(updated.chairman?.id).toBe(ownerId);
      expect(updated.secretary?.id).toBe(ownerId);
      expect(updated.treasurer?.id).toBe(ownerId);
    });

    it('clears a role back to unassigned when given an empty string', async () => {
      const updated = await updateSocietySettings(societyId, { secretaryId: '' });
      expect(updated.secretary).toBeNull();
      expect(updated.chairman?.id).toBe(ownerId);
    });

    it('rejects a user id that is not an owner in this society', async () => {
      await expect(updateSocietySettings(societyId, { chairmanId: otherSocietyOwnerId })).rejects.toThrow(
        InvalidCommitteeMemberError,
      );
    });

    it('rejects a nonexistent user id', async () => {
      await expect(updateSocietySettings(societyId, { treasurerId: 'does-not-exist' })).rejects.toThrow(
        InvalidCommitteeMemberError,
      );
    });
  });

  it('updates all core fields together', async () => {
    const updated = await updateSocietySettings(societyId, {
      name: 'Final Society Name',
      address: 'Final Address',
      upiVpa: 'final@upi',
      tenantRateFactor: 2,
      defaultBaseRate: 2000,
    });
    expect(updated.name).toBe('Final Society Name');
    expect(updated.address).toBe('Final Address');
    expect(updated.upiVpa).toBe('final@upi');
    expect(updated.tenantRateFactor).toBe(2);
    expect(updated.defaultBaseRate).toBe(2000);
  });

  describe('receipt signature lifecycle', () => {
    it('sets a signature, reports hasSignature true, and serves the bytes back', async () => {
      const updated = await setReceiptSignature(societyId, {
        buffer: Buffer.from('fake-png-bytes-1'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(updated.hasSignature).toBe(true);

      const view = await getReceiptSignatureForViewing(societyId);
      expect(view).not.toBeNull();
      expect(view!.mimeType).toBe('image/png');
    });

    it('replacing a signature saves the new file before deleting the old one', async () => {
      const before = await prisma.society.findUniqueOrThrow({
        where: { id: societyId },
        select: { receiptSignatureFileKey: true },
      });
      const oldKey = before.receiptSignatureFileKey!;

      const updated = await setReceiptSignature(societyId, {
        buffer: Buffer.from('fake-png-bytes-2'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(updated.hasSignature).toBe(true);

      // The old file is gone (deleted only *after* the replacement succeeded)...
      await expectFileGone(oldKey);

      // ...and the new one is what's actually served now.
      const view = await getReceiptSignatureForViewing(societyId);
      const chunks: Buffer[] = [];
      for await (const chunk of view!.stream) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('fake-png-bytes-2');
    });

    it('removing a signature clears hasSignature and deletes the stored file', async () => {
      const before = await prisma.society.findUniqueOrThrow({
        where: { id: societyId },
        select: { receiptSignatureFileKey: true },
      });
      const key = before.receiptSignatureFileKey!;

      const updated = await removeReceiptSignature(societyId);
      expect(updated.hasSignature).toBe(false);

      const view = await getReceiptSignatureForViewing(societyId);
      expect(view).toBeNull();
      await expectFileGone(key);
    });

    it('removing when no signature is set is a harmless no-op', async () => {
      const updated = await removeReceiptSignature(societyId);
      expect(updated.hasSignature).toBe(false);
    });
  });
});
