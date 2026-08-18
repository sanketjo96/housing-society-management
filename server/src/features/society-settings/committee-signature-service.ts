// Committee-member signature file upload/remove/view (chairman, secretary,
// treasurer). General settings CRUD lives in ./settings-service.ts; row-shaping and
// per-role column helpers shared by both live in ./society-settings-shared.ts.
import type { Readable } from 'node:stream';
import { prisma } from '../../infrastructure/prisma/client';
import { getStorageAdapter } from '../../infrastructure/storage';
import {
  committeeSignatureUpdateData,
  readCommitteeSignatureFileKey,
  readCommitteeSignatureMimeType,
  SETTINGS_SELECT,
  toSettings,
  type CommitteeRole,
  type SocietySettings,
} from './society-settings-shared';

export type { CommitteeRole };

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
