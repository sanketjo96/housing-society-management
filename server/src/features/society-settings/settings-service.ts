// General society settings: billing rules, payment method config, receipt template
// text, and committee-member assignment. Signature file upload/remove/view lives in
// ./committee-signature-service.ts.
import { prisma } from '../../infrastructure/prisma/client';
import { getStorageAdapter } from '../../infrastructure/storage';
import {
  SETTINGS_SELECT,
  toSettings,
  type SignatureColumns,
  type SocietySettings,
} from './society-settings-shared';

// Thrown when a PATCH would leave the society with exactly one of
// bankAccountNumber/bankIfsc set — checked against the merged final state, not the
// request body alone, since either field can legitimately be omitted to leave it
// untouched.
export class IncompleteBankDetailsError extends Error {
  constructor() {
    super('Both account number and IFSC code are required together');
    this.name = 'IncompleteBankDetailsError';
  }
}

// Thrown when a committee role is set to a user id that doesn't resolve to an
// existing OWNER in this society.
export class InvalidCommitteeMemberError extends Error {
  constructor(role: string) {
    super(`Selected ${role} must be an existing owner in this society`);
    this.name = 'InvalidCommitteeMemberError';
  }
}

export interface UpdateSocietySettingsInput {
  name?: string;
  address?: string;
  // "YYYY-MM-DD". Required when present — an empty string is rejected, not
  // cleared to null (enforced in the controller's Zod schema).
  constructionDate?: string;
  formationDate?: string;
  // An empty string clears the field back to null.
  upiVpa?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  tenantRateFactor?: number;
  defaultBaseRate?: number;
  receiptNumberPrefix?: string;
  receiptFooterNote?: string;
  // A non-empty value must resolve to an OWNER in this society.
  chairmanId?: string;
  secretaryId?: string;
  treasurerId?: string;
}

async function resolveCommitteeMemberUpdate(
  societyId: string,
  userId: string | undefined,
  roleLabel: string,
): Promise<string | undefined | null> {
  if (userId === undefined) return undefined;
  if (userId === '') return null;
  const owner = await prisma.user.findFirst({ where: { id: userId, societyId, role: 'OWNER' } });
  if (!owner) throw new InvalidCommitteeMemberError(roleLabel);
  return userId;
}

export async function getSocietySettings(societyId: string): Promise<SocietySettings> {
  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: SETTINGS_SELECT,
  });
  return toSettings(society);
}

// upiVpa feeds every future QR generation directly, read fresh from the Society
// row each time — no caching.
export async function updateSocietySettings(
  societyId: string,
  input: UpdateSocietySettingsInput,
): Promise<SocietySettings> {
  // Only bother checking the merged final state when this PATCH actually touches
  // either bank field — every other field is independent and needs no such check.
  if (input.bankAccountNumber !== undefined || input.bankIfsc !== undefined) {
    const current = await prisma.society.findUniqueOrThrow({
      where: { id: societyId },
      select: { bankAccountNumber: true, bankIfsc: true },
    });
    const finalAccountNumber =
      input.bankAccountNumber !== undefined
        ? input.bankAccountNumber || null
        : current.bankAccountNumber;
    const finalIfsc = input.bankIfsc !== undefined ? input.bankIfsc || null : current.bankIfsc;
    if (!!finalAccountNumber !== !!finalIfsc) {
      throw new IncompleteBankDetailsError();
    }
  }

  // Resolved and validated before the write, so an invalid committee selection
  // never gets mixed into a partially-applied update.
  const [chairmanId, secretaryId, treasurerId] = await Promise.all([
    resolveCommitteeMemberUpdate(societyId, input.chairmanId, 'chairman'),
    resolveCommitteeMemberUpdate(societyId, input.secretaryId, 'secretary'),
    resolveCommitteeMemberUpdate(societyId, input.treasurerId, 'treasurer'),
  ]);

  // Auto-clear a role's signature when its assignee is genuinely changing — a
  // signature belongs to a specific person and must not silently keep representing
  // someone no longer in the role. Re-saving the same person must NOT clear
  // anything.
  let currentCommittee:
    | ({
        chairmanId: string | null;
        secretaryId: string | null;
        treasurerId: string | null;
      } & SignatureColumns)
    | null = null;
  if (
    input.chairmanId !== undefined ||
    input.secretaryId !== undefined ||
    input.treasurerId !== undefined
  ) {
    currentCommittee = await prisma.society.findUniqueOrThrow({
      where: { id: societyId },
      select: {
        chairmanId: true,
        secretaryId: true,
        treasurerId: true,
        chairmanSignatureFileKey: true,
        chairmanSignatureMimeType: true,
        secretarySignatureFileKey: true,
        secretarySignatureMimeType: true,
        receiptSignatureFileKey: true,
        receiptSignatureMimeType: true,
      },
    });
  }

  function isGenuineReassignment(
    resolvedId: string | undefined | null,
    currentId: string | null | undefined,
  ): boolean {
    return resolvedId !== undefined && resolvedId !== null && resolvedId !== currentId;
  }

  const clearChairmanSignature =
    currentCommittee !== null && isGenuineReassignment(chairmanId, currentCommittee.chairmanId);
  const clearSecretarySignature =
    currentCommittee !== null && isGenuineReassignment(secretaryId, currentCommittee.secretaryId);
  const clearTreasurerSignature =
    currentCommittee !== null && isGenuineReassignment(treasurerId, currentCommittee.treasurerId);

  const society = await prisma.society.update({
    where: { id: societyId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      // Format ("YYYY-MM-DD") and non-emptiness are already validated by the
      // controller's Zod schema before this ever runs.
      ...(input.constructionDate !== undefined
        ? { constructionDate: new Date(input.constructionDate) }
        : {}),
      ...(input.formationDate !== undefined
        ? { formationDate: new Date(input.formationDate) }
        : {}),
      ...(input.upiVpa !== undefined ? { upiVpa: input.upiVpa || null } : {}),
      ...(input.bankAccountNumber !== undefined
        ? { bankAccountNumber: input.bankAccountNumber || null }
        : {}),
      ...(input.bankIfsc !== undefined ? { bankIfsc: input.bankIfsc || null } : {}),
      ...(input.tenantRateFactor !== undefined ? { tenantRateFactor: input.tenantRateFactor } : {}),
      ...(input.defaultBaseRate !== undefined ? { defaultBaseRate: input.defaultBaseRate } : {}),
      ...(chairmanId !== undefined ? { chairmanId } : {}),
      ...(clearChairmanSignature
        ? { chairmanSignatureFileKey: null, chairmanSignatureMimeType: null }
        : {}),
      ...(secretaryId !== undefined ? { secretaryId } : {}),
      ...(clearSecretarySignature
        ? { secretarySignatureFileKey: null, secretarySignatureMimeType: null }
        : {}),
      ...(treasurerId !== undefined ? { treasurerId } : {}),
      ...(clearTreasurerSignature
        ? { receiptSignatureFileKey: null, receiptSignatureMimeType: null }
        : {}),
      ...(input.receiptNumberPrefix !== undefined
        ? { receiptNumberPrefix: input.receiptNumberPrefix }
        : {}),
      ...(input.receiptFooterNote !== undefined
        ? { receiptFooterNote: input.receiptFooterNote || null }
        : {}),
    },
    select: SETTINGS_SELECT,
  });

  // Delete the now-orphaned files only once the row is confirmed cleared.
  if (clearChairmanSignature && currentCommittee!.chairmanSignatureFileKey) {
    await getStorageAdapter().delete(currentCommittee!.chairmanSignatureFileKey);
  }
  if (clearSecretarySignature && currentCommittee!.secretarySignatureFileKey) {
    await getStorageAdapter().delete(currentCommittee!.secretarySignatureFileKey);
  }
  if (clearTreasurerSignature && currentCommittee!.receiptSignatureFileKey) {
    await getStorageAdapter().delete(currentCommittee!.receiptSignatureFileKey);
  }

  return toSettings(society);
}
