import type { Readable } from 'node:stream';
import { prisma } from '../db';
import { getStorageAdapter } from '../lib/storage';

export interface SocietySettings {
  name: string;
  address: string;
  upiVpa: string;
  tenantRateFactor: number;
  defaultBaseRate: number;
  // Receipt template customization (Receipt Generation & Approval Workflow,
  // 2026-08-11) — see docs/receipts.md. hasSignature (not the raw storage key) is
  // returned to the client; the actual bytes are only ever served through the
  // dedicated authenticated GET /api/admin/settings/signature endpoint below.
  receiptNumberPrefix: string;
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  hasSignature: boolean;
}

export interface UpdateSocietySettingsInput {
  name?: string;
  address?: string;
  upiVpa?: string;
  tenantRateFactor?: number;
  defaultBaseRate?: number;
  receiptNumberPrefix?: string;
  // An empty string clears the field back to null (there's a real "no footer note
  // configured" state, distinct from "leave whatever was there"); omitting the key
  // entirely leaves it untouched — ordinary PATCH-semantics, same as every other
  // optional field on this input.
  receiptSignatoryName?: string;
  receiptSignatoryTitle?: string;
  receiptFooterNote?: string;
}

interface SocietyRow {
  name: string;
  address: string;
  upiVpa: string;
  tenantRateFactor: unknown;
  defaultBaseRate: unknown;
  receiptNumberPrefix: string;
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  receiptSignatureFileKey: string | null;
}

const SETTINGS_SELECT = {
  name: true,
  address: true,
  upiVpa: true,
  tenantRateFactor: true,
  defaultBaseRate: true,
  receiptNumberPrefix: true,
  receiptSignatoryName: true,
  receiptSignatoryTitle: true,
  receiptFooterNote: true,
  receiptSignatureFileKey: true,
} as const;

function toSettings(society: SocietyRow): SocietySettings {
  return {
    name: society.name,
    address: society.address,
    upiVpa: society.upiVpa,
    tenantRateFactor: Number(society.tenantRateFactor),
    defaultBaseRate: Number(society.defaultBaseRate),
    receiptNumberPrefix: society.receiptNumberPrefix,
    receiptSignatoryName: society.receiptSignatoryName,
    receiptSignatoryTitle: society.receiptSignatoryTitle,
    receiptFooterNote: society.receiptFooterNote,
    hasSignature: !!society.receiptSignatureFileKey,
  };
}

export async function getSocietySettings(societyId: string): Promise<SocietySettings> {
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId }, select: SETTINGS_SELECT });
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
  const society = await prisma.society.update({
    where: { id: societyId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.upiVpa !== undefined ? { upiVpa: input.upiVpa } : {}),
      ...(input.tenantRateFactor !== undefined ? { tenantRateFactor: input.tenantRateFactor } : {}),
      ...(input.defaultBaseRate !== undefined ? { defaultBaseRate: input.defaultBaseRate } : {}),
      ...(input.receiptNumberPrefix !== undefined ? { receiptNumberPrefix: input.receiptNumberPrefix } : {}),
      ...(input.receiptSignatoryName !== undefined
        ? { receiptSignatoryName: input.receiptSignatoryName || null }
        : {}),
      ...(input.receiptSignatoryTitle !== undefined
        ? { receiptSignatoryTitle: input.receiptSignatoryTitle || null }
        : {}),
      ...(input.receiptFooterNote !== undefined ? { receiptFooterNote: input.receiptFooterNote || null } : {}),
    },
    select: SETTINGS_SELECT,
  });
  return toSettings(society);
}

export interface SignatureFileInput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

// Ordering matters: save the new file, point the Society row at it, and only then
// delete the old one (if replacing) — never delete-then-save. A failure between
// those steps must never leave Settings referencing a file that no longer exists;
// worst case on a failed replace, the *old* signature simply stays in effect a bit
// longer, which is harmless.
export async function setReceiptSignature(societyId: string, file: SignatureFileInput): Promise<SocietySettings> {
  const existing = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: { receiptSignatureFileKey: true },
  });

  const { key } = await getStorageAdapter().save({ buffer: file.buffer, societyId, extension: file.extension });

  const society = await prisma.society.update({
    where: { id: societyId },
    data: { receiptSignatureFileKey: key, receiptSignatureMimeType: file.mimeType },
    select: SETTINGS_SELECT,
  });

  if (existing.receiptSignatureFileKey) {
    await getStorageAdapter().delete(existing.receiptSignatureFileKey);
  }

  return toSettings(society);
}

// Reverts to the blank-signature-line fallback on every future receipt. Deletes
// the stored file only after the DB row is confirmed cleared, same ordering
// principle as setReceiptSignature above.
export async function removeReceiptSignature(societyId: string): Promise<SocietySettings> {
  const existing = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: { receiptSignatureFileKey: true },
  });

  const society = await prisma.society.update({
    where: { id: societyId },
    data: { receiptSignatureFileKey: null, receiptSignatureMimeType: null },
    select: SETTINGS_SELECT,
  });

  if (existing.receiptSignatureFileKey) {
    await getStorageAdapter().delete(existing.receiptSignatureFileKey);
  }

  return toSettings(society);
}

// Authenticated stream-back for the Settings UI's own preview thumbnail — never a
// public path, same "opaque key, private access" contract as every other stored
// file in this app.
export async function getReceiptSignatureForViewing(
  societyId: string,
): Promise<{ stream: Readable; mimeType: string } | null> {
  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    select: { receiptSignatureFileKey: true, receiptSignatureMimeType: true },
  });
  if (!society.receiptSignatureFileKey) return null;

  const stream = await getStorageAdapter().read(society.receiptSignatureFileKey);
  return { stream, mimeType: society.receiptSignatureMimeType ?? 'application/octet-stream' };
}
