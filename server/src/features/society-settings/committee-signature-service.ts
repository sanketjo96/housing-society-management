// Committee-member signature file upload/remove/view (chairman, secretary,
// treasurer). General settings CRUD lives in ./settings-service.ts.
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

// Ordering matters: save the new file, point the Society row at it, only then
// delete the old one — never delete-then-save. A failure between those steps
// leaves the old signature in effect a bit longer, which is harmless.
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

// Reverts to the blank-signature-line fallback on future receipts (treasurer) or
// clears the Committee tab's stored image (chairman/secretary). Deletes the file
// only after the DB row is confirmed cleared.
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

// Authenticated stream-back for the Settings UI's preview thumbnail — never a
// public path.
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
