import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { getStorageAdapter } from '../../../src/infrastructure/storage';
import {
  getCommitteeSignatureForViewing,
  getSocietySettings,
  IncompleteBankDetailsError,
  InvalidCommitteeMemberError,
  removeCommitteeSignature,
  setCommitteeSignature,
  updateSocietySettings,
} from '../../../src/features/society-settings/society-settings.service';

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
      hasChairmanSignature: false,
      hasSecretarySignature: false,
      hasTreasurerSignature: false,
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
    await expect(
      updateSocietySettings(societyId, { bankAccountNumber: '123456789012' }),
    ).rejects.toThrow(IncompleteBankDetailsError);
  });

  it('rejects clearing just one side of an already-complete pair', async () => {
    await updateSocietySettings(societyId, {
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
    });
    await expect(updateSocietySettings(societyId, { bankIfsc: '' })).rejects.toThrow(
      IncompleteBankDetailsError,
    );
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
      const updated = await updateSocietySettings(societyId, {
        secretaryId: ownerId,
        treasurerId: ownerId,
      });
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
      await expect(
        updateSocietySettings(societyId, { chairmanId: otherSocietyOwnerId }),
      ).rejects.toThrow(InvalidCommitteeMemberError);
    });

    it('rejects a nonexistent user id', async () => {
      await expect(
        updateSocietySettings(societyId, { treasurerId: 'does-not-exist' }),
      ).rejects.toThrow(InvalidCommitteeMemberError);
    });
  });

  describe('committee signature auto-clear on reassignment', () => {
    let reassignOwnerId: string;

    beforeAll(async () => {
      const reassignOwner = await prisma.user.create({
        data: {
          name: 'Reassign Owner',
          email: `reassign-owner-${suffix}@example.com`,
          passwordHash: 'x',
          role: 'OWNER',
          societyId,
        },
      });
      reassignOwnerId = reassignOwner.id;
    });

    afterAll(async () => {
      await prisma.user.delete({ where: { id: reassignOwnerId } });
    });

    it("clears and deletes a role's signature when its assignee genuinely changes", async () => {
      await updateSocietySettings(societyId, { chairmanId: ownerId });
      const withSig = await setCommitteeSignature(societyId, 'CHAIRMAN', {
        buffer: Buffer.from('chairman-sig-1'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(withSig.hasChairmanSignature).toBe(true);
      const before = await prisma.society.findUniqueOrThrow({
        where: { id: societyId },
        select: { chairmanSignatureFileKey: true },
      });
      const oldKey = before.chairmanSignatureFileKey!;

      const reassigned = await updateSocietySettings(societyId, { chairmanId: reassignOwnerId });
      expect(reassigned.chairman?.id).toBe(reassignOwnerId);
      expect(reassigned.hasChairmanSignature).toBe(false);
      await expectFileGone(oldKey);
    });

    it('leaves the signature untouched when re-saving the same person', async () => {
      const withSig = await setCommitteeSignature(societyId, 'CHAIRMAN', {
        buffer: Buffer.from('chairman-sig-2'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(withSig.hasChairmanSignature).toBe(true);

      const resaved = await updateSocietySettings(societyId, { chairmanId: reassignOwnerId });
      expect(resaved.hasChairmanSignature).toBe(true);
    });

    it("leaves an unrelated role's signature untouched, and only clears the reassigned role's", async () => {
      await updateSocietySettings(societyId, { secretaryId: ownerId });
      const withSig = await setCommitteeSignature(societyId, 'SECRETARY', {
        buffer: Buffer.from('secretary-sig-1'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(withSig.hasSecretarySignature).toBe(true);
      expect(withSig.hasChairmanSignature).toBe(true); // still set from the previous test

      // Reassigns chairman (reassignOwnerId -> ownerId) — a genuine change.
      const reassignedChairman = await updateSocietySettings(societyId, { chairmanId: ownerId });
      expect(reassignedChairman.hasChairmanSignature).toBe(false);
      expect(reassignedChairman.hasSecretarySignature).toBe(true);
    });

    it('clears a legacy treasurer signature (set before any treasurer was ever assigned) the first time a treasurer is assigned', async () => {
      // Simulate the old standalone Receipt-template upload: a signature exists
      // even though no treasurer has ever been assigned via the Committee tab.
      await prisma.society.update({ where: { id: societyId }, data: { treasurerId: null } });
      const legacy = await setCommitteeSignature(societyId, 'TREASURER', {
        buffer: Buffer.from('legacy-treasurer-sig'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(legacy.treasurer).toBeNull();
      expect(legacy.hasTreasurerSignature).toBe(true);

      const assigned = await updateSocietySettings(societyId, { treasurerId: ownerId });
      expect(assigned.treasurer?.id).toBe(ownerId);
      expect(assigned.hasTreasurerSignature).toBe(false);
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

  describe('committee signature lifecycle', () => {
    it('sets a treasurer signature, reports hasTreasurerSignature true, and serves the bytes back', async () => {
      const updated = await setCommitteeSignature(societyId, 'TREASURER', {
        buffer: Buffer.from('fake-png-bytes-1'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(updated.hasTreasurerSignature).toBe(true);

      const view = await getCommitteeSignatureForViewing(societyId, 'TREASURER');
      expect(view).not.toBeNull();
      expect(view!.mimeType).toBe('image/png');
    });

    it('replacing a signature saves the new file before deleting the old one', async () => {
      const before = await prisma.society.findUniqueOrThrow({
        where: { id: societyId },
        select: { receiptSignatureFileKey: true },
      });
      const oldKey = before.receiptSignatureFileKey!;

      const updated = await setCommitteeSignature(societyId, 'TREASURER', {
        buffer: Buffer.from('fake-png-bytes-2'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(updated.hasTreasurerSignature).toBe(true);

      // The old file is gone (deleted only *after* the replacement succeeded)...
      await expectFileGone(oldKey);

      // ...and the new one is what's actually served now.
      const view = await getCommitteeSignatureForViewing(societyId, 'TREASURER');
      const chunks: Buffer[] = [];
      for await (const chunk of view!.stream) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('fake-png-bytes-2');
    });

    it('removing a signature clears hasTreasurerSignature and deletes the stored file', async () => {
      const before = await prisma.society.findUniqueOrThrow({
        where: { id: societyId },
        select: { receiptSignatureFileKey: true },
      });
      const key = before.receiptSignatureFileKey!;

      const updated = await removeCommitteeSignature(societyId, 'TREASURER');
      expect(updated.hasTreasurerSignature).toBe(false);

      const view = await getCommitteeSignatureForViewing(societyId, 'TREASURER');
      expect(view).toBeNull();
      await expectFileGone(key);
    });

    it('removing when no signature is set is a harmless no-op', async () => {
      const updated = await removeCommitteeSignature(societyId, 'TREASURER');
      expect(updated.hasTreasurerSignature).toBe(false);
    });

    it('chairman, secretary, and treasurer signatures are stored and served independently', async () => {
      await setCommitteeSignature(societyId, 'CHAIRMAN', {
        buffer: Buffer.from('chairman-bytes'),
        mimeType: 'image/png',
        extension: '.png',
      });
      await setCommitteeSignature(societyId, 'SECRETARY', {
        buffer: Buffer.from('secretary-bytes'),
        mimeType: 'image/png',
        extension: '.png',
      });
      const withTreasurer = await setCommitteeSignature(societyId, 'TREASURER', {
        buffer: Buffer.from('treasurer-bytes'),
        mimeType: 'image/png',
        extension: '.png',
      });
      expect(withTreasurer.hasChairmanSignature).toBe(true);
      expect(withTreasurer.hasSecretarySignature).toBe(true);
      expect(withTreasurer.hasTreasurerSignature).toBe(true);

      const chairmanView = await getCommitteeSignatureForViewing(societyId, 'CHAIRMAN');
      const secretaryView = await getCommitteeSignatureForViewing(societyId, 'SECRETARY');
      const chairmanChunks: Buffer[] = [];
      for await (const chunk of chairmanView!.stream) chairmanChunks.push(chunk as Buffer);
      const secretaryChunks: Buffer[] = [];
      for await (const chunk of secretaryView!.stream) secretaryChunks.push(chunk as Buffer);
      expect(Buffer.concat(chairmanChunks).toString()).toBe('chairman-bytes');
      expect(Buffer.concat(secretaryChunks).toString()).toBe('secretary-bytes');

      // Removing one role's signature doesn't touch the others.
      const afterRemove = await removeCommitteeSignature(societyId, 'CHAIRMAN');
      expect(afterRemove.hasChairmanSignature).toBe(false);
      expect(afterRemove.hasSecretarySignature).toBe(true);
      expect(afterRemove.hasTreasurerSignature).toBe(true);
    });
  });
});
