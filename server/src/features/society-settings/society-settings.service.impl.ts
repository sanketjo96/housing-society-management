import type { Readable } from 'node:stream';
import { prisma } from '../../infrastructure/prisma/client';
import { getStorageAdapter } from '../../infrastructure/storage';

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

export interface CommitteeMemberSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// Treasurer deliberately reuses the pre-existing receiptSignatureFileKey/
// receiptSignatureMimeType columns rather than getting its own — see the schema
// comment on Society.receiptSignatureFileKey.
export type CommitteeRole = 'CHAIRMAN' | 'SECRETARY' | 'TREASURER';

interface SignatureColumns {
  chairmanSignatureFileKey: string | null;
  chairmanSignatureMimeType: string | null;
  secretarySignatureFileKey: string | null;
  secretarySignatureMimeType: string | null;
  receiptSignatureFileKey: string | null;
  receiptSignatureMimeType: string | null;
}

function committeeSignatureUpdateData(
  role: CommitteeRole,
  key: string | null,
  mimeType: string | null,
) {
  switch (role) {
    case 'CHAIRMAN':
      return { chairmanSignatureFileKey: key, chairmanSignatureMimeType: mimeType };
    case 'SECRETARY':
      return { secretarySignatureFileKey: key, secretarySignatureMimeType: mimeType };
    case 'TREASURER':
      return { receiptSignatureFileKey: key, receiptSignatureMimeType: mimeType };
  }
}

function readCommitteeSignatureFileKey(
  society: SignatureColumns,
  role: CommitteeRole,
): string | null {
  switch (role) {
    case 'CHAIRMAN':
      return society.chairmanSignatureFileKey;
    case 'SECRETARY':
      return society.secretarySignatureFileKey;
    case 'TREASURER':
      return society.receiptSignatureFileKey;
  }
}

function readCommitteeSignatureMimeType(
  society: SignatureColumns,
  role: CommitteeRole,
): string | null {
  switch (role) {
    case 'CHAIRMAN':
      return society.chairmanSignatureMimeType;
    case 'SECRETARY':
      return society.secretarySignatureMimeType;
    case 'TREASURER':
      return society.receiptSignatureMimeType;
  }
}

export interface SocietySettings {
  name: string;
  address: string;
  // Basic information tab — required going forward (enforced in the controller's
  // Zod schema, not the DB, since existing societies predate these fields). Date
  // strings, "YYYY-MM-DD" — time-of-day is never meaningful for either.
  constructionDate: string | null;
  formationDate: string | null;
  // UPI always takes precedence over bank details when both are configured — see
  // ledger.service.ts's buildPaymentIntentResult, the one place that choice
  // actually matters.
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: number;
  defaultBaseRate: number;
  // Receipt template customization (Receipt Generation & Approval Workflow,
  // 2026-08-11) — see docs/receipts.md.
  receiptNumberPrefix: string;
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  // Committee-member signatures (2026-08-17) — hasXSignature flags (not the raw
  // storage keys) are returned to the client; the actual bytes are only ever
  // served through the dedicated authenticated
  // GET /api/admin/settings/committee/:role/signature endpoint below. Treasurer's
  // flag reflects the same underlying file the receipt letterhead uses.
  hasChairmanSignature: boolean;
  hasSecretarySignature: boolean;
  hasTreasurerSignature: boolean;
  // Committee tab (Society details) — each nullable, independently set from a
  // dropdown of this society's owners. Informational only; nothing in billing or
  // permissions reads these.
  chairman: CommitteeMemberSummary | null;
  secretary: CommitteeMemberSummary | null;
  treasurer: CommitteeMemberSummary | null;
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
  receiptSignatoryName?: string;
  receiptSignatoryTitle?: string;
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

interface CommitteeMemberRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface SocietyRow extends SignatureColumns {
  name: string;
  address: string;
  constructionDate: Date | null;
  formationDate: Date | null;
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: unknown;
  defaultBaseRate: unknown;
  receiptNumberPrefix: string;
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  chairman: CommitteeMemberRow | null;
  secretary: CommitteeMemberRow | null;
  treasurer: CommitteeMemberRow | null;
}

const COMMITTEE_MEMBER_SELECT = {
  select: { id: true, name: true, email: true, phone: true },
} as const;

const SETTINGS_SELECT = {
  name: true,
  address: true,
  constructionDate: true,
  formationDate: true,
  upiVpa: true,
  bankAccountNumber: true,
  bankIfsc: true,
  tenantRateFactor: true,
  defaultBaseRate: true,
  receiptNumberPrefix: true,
  receiptSignatoryName: true,
  receiptSignatoryTitle: true,
  receiptFooterNote: true,
  receiptSignatureFileKey: true,
  receiptSignatureMimeType: true,
  chairmanSignatureFileKey: true,
  chairmanSignatureMimeType: true,
  secretarySignatureFileKey: true,
  secretarySignatureMimeType: true,
  chairman: COMMITTEE_MEMBER_SELECT,
  secretary: COMMITTEE_MEMBER_SELECT,
  treasurer: COMMITTEE_MEMBER_SELECT,
} as const;

// Date-only fields are stored as DateTime (midnight UTC) but never shown/edited
// with a time component — always rendered back as "YYYY-MM-DD".
function toDateString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function toSettings(society: SocietyRow): SocietySettings {
  return {
    name: society.name,
    address: society.address,
    constructionDate: toDateString(society.constructionDate),
    formationDate: toDateString(society.formationDate),
    upiVpa: society.upiVpa,
    bankAccountNumber: society.bankAccountNumber,
    bankIfsc: society.bankIfsc,
    tenantRateFactor: Number(society.tenantRateFactor),
    defaultBaseRate: Number(society.defaultBaseRate),
    receiptNumberPrefix: society.receiptNumberPrefix,
    receiptSignatoryName: society.receiptSignatoryName,
    receiptSignatoryTitle: society.receiptSignatoryTitle,
    receiptFooterNote: society.receiptFooterNote,
    hasChairmanSignature: !!readCommitteeSignatureFileKey(society, 'CHAIRMAN'),
    hasSecretarySignature: !!readCommitteeSignatureFileKey(society, 'SECRETARY'),
    hasTreasurerSignature: !!readCommitteeSignatureFileKey(society, 'TREASURER'),
    chairman: society.chairman,
    secretary: society.secretary,
    treasurer: society.treasurer,
  };
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
      ...(input.receiptSignatoryName !== undefined
        ? { receiptSignatoryName: input.receiptSignatoryName || null }
        : {}),
      ...(input.receiptSignatoryTitle !== undefined
        ? { receiptSignatoryTitle: input.receiptSignatoryTitle || null }
        : {}),
      ...(input.receiptFooterNote !== undefined
        ? { receiptFooterNote: input.receiptFooterNote || null }
        : {}),
    },
    select: SETTINGS_SELECT,
  });

  // Delete the now-orphaned files only once the row is confirmed cleared — same
  // ordering principle as removeCommitteeSignature below.
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

export interface SignatureFileInput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

const SIGNATURE_COLUMNS_SELECT = {
  chairmanSignatureFileKey: true,
  chairmanSignatureMimeType: true,
  secretarySignatureFileKey: true,
  secretarySignatureMimeType: true,
  receiptSignatureFileKey: true,
  receiptSignatureMimeType: true,
} as const;

// Ordering matters: save the new file, point the Society row at it, and only then
// delete the old one (if replacing) — never delete-then-save. A failure between
// those steps must never leave Settings referencing a file that no longer exists;
// worst case on a failed replace, the *old* signature simply stays in effect a bit
// longer, which is harmless. One role-parameterized implementation replaces the
// former treasurer-only setReceiptSignature — its one caller (the Receipt
// template page's standalone signature upload) was removed in favor of managing
// every committee member's signature from this one place.
export async function setCommitteeSignature(
  societyId: string,
  role: CommitteeRole,
  file: SignatureFileInput,
): Promise<SocietySettings> {
  const existing = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: SIGNATURE_COLUMNS_SELECT,
  });
  const existingKey = readCommitteeSignatureFileKey(existing, role);

  const { key } = await getStorageAdapter().save({
    buffer: file.buffer,
    societyId,
    extension: file.extension,
  });

  const society = await prisma.society.update({
    where: { id: societyId },
    data: committeeSignatureUpdateData(role, key, file.mimeType),
    select: SETTINGS_SELECT,
  });

  if (existingKey) {
    await getStorageAdapter().delete(existingKey);
  }

  return toSettings(society);
}

// Reverts to the blank-signature-line fallback on every future receipt (for the
// treasurer role) or simply clears the Committee tab's stored image (chairman/
// secretary). Deletes the stored file only after the DB row is confirmed cleared,
// same ordering principle as setCommitteeSignature above.
export async function removeCommitteeSignature(
  societyId: string,
  role: CommitteeRole,
): Promise<SocietySettings> {
  const existing = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: SIGNATURE_COLUMNS_SELECT,
  });
  const existingKey = readCommitteeSignatureFileKey(existing, role);

  const society = await prisma.society.update({
    where: { id: societyId },
    data: committeeSignatureUpdateData(role, null, null),
    select: SETTINGS_SELECT,
  });

  if (existingKey) {
    await getStorageAdapter().delete(existingKey);
  }

  return toSettings(society);
}

// Authenticated stream-back for the Settings UI's own preview thumbnail — never a
// public path, same "opaque key, private access" contract as every other stored
// file in this app.
export async function getCommitteeSignatureForViewing(
  societyId: string,
  role: CommitteeRole,
): Promise<{ stream: Readable; mimeType: string } | null> {
  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: SIGNATURE_COLUMNS_SELECT,
  });
  const key = readCommitteeSignatureFileKey(society, role);
  if (!key) return null;

  const stream = await getStorageAdapter().read(key);
  return {
    stream,
    mimeType: readCommitteeSignatureMimeType(society, role) ?? 'application/octet-stream',
  };
}
