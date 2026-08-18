// General society settings: billing rules, payment method config, receipt template
// text, and committee-member assignment. Signature file upload/remove/view lives in
// ./committee-signature-service.ts; row-shaping and per-role column helpers shared by
// both live in ./society-settings-shared.ts.
import { prisma } from '../../infrastructure/prisma/client';
import { getStorageAdapter } from '../../infrastructure/storage';
import {
  SETTINGS_SELECT,
  toSettings,
  type SignatureColumns,
  type SocietySettings,
} from './society-settings-shared';

// Thrown when a PATCH would leave the society with exactly one of
// bankAccountNumber/bankIfsc set — checked against the *merged* final state (this
// input's fields layered onto whatever's already stored), not the request body
// alone, since either field can legitimately be omitted on a given PATCH to leave
// it untouched. A lone account number with no IFSC (or vice versa) can't be shown
// to a resident trying to pay, so it's rejected outright rather than silently
// saved half-complete.
export class IncompleteBankDetailsError extends Error {
  constructor() {
    super('Both account number and IFSC code are required together');
    this.name = 'IncompleteBankDetailsError';
  }
}

// Thrown when a committee role (chairman/secretary/treasurer) is set to a user id
// that doesn't resolve to an existing OWNER in this society — the dropdown only
// ever offers real owners, so this only fires on a stale/tampered request.
export class InvalidCommitteeMemberError extends Error {
  constructor(role: string) {
    super(`Selected ${role} must be an existing owner in this society`);
    this.name = 'InvalidCommitteeMemberError';
  }
}

export interface UpdateSocietySettingsInput {
  name?: string;
  address?: string;
  // Required — unlike upiVpa etc. below, an empty string is rejected rather than
  // clearing the field back to null (validated in the controller's Zod schema,
  // which is where "required when present" is enforced; the service just parses
  // whatever valid date string arrives). "YYYY-MM-DD".
  constructionDate?: string;
  formationDate?: string;
  // An empty string clears the field back to null — same PATCH convention as the
  // receipt text fields below (there's a real "not configured" state, distinct
  // from "leave whatever was there").
  upiVpa?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  tenantRateFactor?: number;
  defaultBaseRate?: number;
  receiptNumberPrefix?: string;
  receiptFooterNote?: string;
  // A non-empty value must resolve to an OWNER in this society. The controller's
  // Zod schema rejects an empty string (roles are required, 2026-08-17) before it
  // ever reaches here — resolveCommitteeMemberUpdate's '' → null clear path below
  // is kept only as a defensive fallback for any other future caller, not reachable
  // through the actual API today.
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

// name and upiVpa added (2026-08-06 addendum) alongside the original
// tenantRateFactor/defaultBaseRate pair — an admin needs to correct the society's
// display name or rotate the UPI collection address without a DB migration/support
// request. upiVpa feeds every future QR generation directly (lib/upi.ts's
// buildUpiDeepLink), read fresh from the Society row each time, same "no caching"
// guarantee tenantRateFactor already has. address + the four receipt text fields
// added 2026-08-11 for the receipt template — see docs/receipts.md.
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

  // Resolved (and validated against this society's owners) before the write, so an
  // invalid committee selection never gets mixed into a partially-applied update.
  const [chairmanId, secretaryId, treasurerId] = await Promise.all([
    resolveCommitteeMemberUpdate(societyId, input.chairmanId, 'chairman'),
    resolveCommitteeMemberUpdate(societyId, input.secretaryId, 'secretary'),
    resolveCommitteeMemberUpdate(societyId, input.treasurerId, 'treasurer'),
  ]);

  // Auto-clear a role's signature when its assignee is genuinely changing — a
  // signature belongs to a specific person, so it must not silently keep
  // representing someone no longer in the role. Only fetched when this PATCH
  // actually touches a committee field (same discipline as the bank-details check
  // above). Re-saving the same person, or the (currently unreachable-via-API)
  // ''-clears-to-null path, must NOT clear anything — isGenuineReassignment only
  // fires on a real, resolved, non-null id that differs from what's on record.
  //
  // Note: a society that had a signature set via the old standalone Receipt
  // template page before ever assigning a treasurer (treasurerId still null,
  // receiptSignatureFileKey already set) will have that legacy signature cleared
  // the first time a treasurer is actually assigned here — intentional, not a
  // bug: nothing yet confirms that stray file belongs to whoever is being
  // assigned.
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

  // Delete the now-orphaned files only once the row is confirmed cleared — same
  // ordering principle as removeCommitteeSignature (./committee-signature-service.ts).
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
