import type { Readable } from 'node:stream';
import type { LedgerCategory, Role } from '../../infrastructure/prisma/generated/client';
import { prisma } from '../../infrastructure/prisma/client';
import {
  ForbiddenLedgerEntryAccessError,
  LedgerEntryAlreadyReviewedError,
  SignaturesNotConfiguredError,
} from '../../shared/errors/errors';
import { renderReceiptPdf, type ReceiptData } from './receipt-pdf';
import { getStorageAdapter } from '../../infrastructure/storage';
import { logger } from '../../infrastructure/observability';

// Minimal shapes this file actually reads, not the full generated Prisma model types.
interface ReceiptFlat {
  wing: string;
  flatNumber: string;
}

interface ReceiptPayer {
  name: string;
}

interface ReceiptSociety {
  id: string;
  name: string;
  address: string;
  receiptNumberPrefix: string;
  receiptFooterNote: string | null;
  // Chairman/Secretary sign every receipt, using the committee User record's name.
  chairman: { name: string } | null;
  secretary: { name: string } | null;
  chairmanSignatureFileKey: string | null;
  secretarySignatureFileKey: string | null;
}

interface ReceiptEntry {
  id: string;
  amount: unknown; // Prisma Decimal — always passed through Number() before use
  note: string | null;
  payerId: string;
  category: LedgerCategory;
}

// Computable purely from the flat + the LedgerEntry's own id — no shared counter,
// no race. Only the last 8 characters of the id are used for readability;
// `Receipt.receiptNumber` is still @unique at the schema level as a backstop.
export function buildReceiptNumber(
  prefix: string,
  flat: ReceiptFlat,
  ledgerEntryId: string,
): string {
  const shortId = ledgerEntryId.slice(-8);
  return `${prefix}-${flat.wing}${flat.flatNumber}-${shortId}`;
}

// Purpose text is a generic label for Maintenance (a Deposit isn't tied to specific
// MaintenanceRecords). For OTHER_CHARGE, the fee type(s) settled are folded in when
// supplied: "Transfer Fee payment" (one), "Transfer Fee, Parking Fine payment"
// (several), falling back to a generic label when none are supplied.
function buildPurposeLabel(entry: ReceiptEntry, otherChargeFeeTypeNames?: string[]): string {
  if (entry.category !== 'OTHER_CHARGE') return 'Maintenance dues payment';
  if (!otherChargeFeeTypeNames || otherChargeFeeTypeNames.length === 0) return 'Other charges payment';
  return `${otherChargeFeeTypeNames.join(', ')} payment`;
}

export function buildReceiptData(
  entry: ReceiptEntry,
  flat: ReceiptFlat,
  payer: ReceiptPayer,
  society: ReceiptSociety,
  opts: { date: Date; otherChargeFeeTypeNames?: string[] },
): ReceiptData {
  return {
    receiptNumber: buildReceiptNumber(society.receiptNumberPrefix, flat, entry.id),
    societyName: society.name,
    societyAddress: society.address,
    residentName: payer.name,
    flatLabel: `${flat.wing}-${flat.flatNumber}`,
    date: opts.date,
    transactionType: 'DEPOSIT',
    purpose: buildPurposeLabel(entry, opts.otherChargeFeeTypeNames),
    // Always the amount stored on the entry at creation, never recomputed from
    // current billing settings.
    amount: Number(entry.amount),
    chairmanName: society.chairman?.name,
    secretaryName: society.secretary?.name,
    footerNote: society.receiptFooterNote ?? undefined,
  };
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// A broken/missing signature file must never block settlement — falls back to
// undefined (blank-line rendering) and logs a warning rather than throwing.
export async function getSignatureBufferOrUndefined(
  fileKey: string | null,
): Promise<Buffer | undefined> {
  if (!fileKey) return undefined;
  try {
    const stream = await getStorageAdapter().read(fileKey);
    return await streamToBuffer(stream);
  } catch (err) {
    logger
      .child({ feature: 'receipts' })
      .warn({ err, fileKey }, 'could not read signature file, rendering without one');
    return undefined;
  }
}

// Fetches both signature images in parallel — either may be undefined.
async function getCommitteeSignatures(
  society: Pick<ReceiptSociety, 'chairmanSignatureFileKey' | 'secretarySignatureFileKey'>,
) {
  const [chairman, secretary] = await Promise.all([
    getSignatureBufferOrUndefined(society.chairmanSignatureFileKey),
    getSignatureBufferOrUndefined(society.secretarySignatureFileKey),
  ]);
  return { chairman, secretary };
}

// A completely blank signatory block is not acceptable — at least one of Chairman/
// Secretary must be configured before any Deposit can be approved.
function assertSignaturesConfigured(
  society: Pick<ReceiptSociety, 'chairmanSignatureFileKey' | 'secretarySignatureFileKey'>,
): void {
  if (!society.chairmanSignatureFileKey && !society.secretarySignatureFileKey) {
    throw new SignaturesNotConfiguredError();
  }
}

const RECEIPT_ENTRY_INCLUDE = {
  flat: { select: { wing: true, flatNumber: true } },
  payer: { select: { name: true } },
} as const;

// "Still outstanding" for an OtherCharge means settledByLedgerEntryId IS NULL.
// Exported so admin-ledger-service.ts can stamp these rows inside its own
// transaction — this file only ever reads.
export async function getOpenOtherCharges(
  flatId: string,
): Promise<{ ids: string[]; feeTypeNames: string[] }> {
  const open = await prisma.otherCharge.findMany({
    where: { flatId, settledByLedgerEntryId: null },
    select: { id: true, feeType: { select: { name: true } } },
  });
  return {
    ids: open.map((c) => c.id),
    feeTypeNames: [...new Set(open.map((c) => c.feeType.name))],
  };
}

// Preview for the admin's approval modal — reuses the same buildReceiptData +
// renderReceiptPdf path the real approval uses, byte-for-byte identical. No side
// effects: no storage.save(), no DB write, no OtherCharge row stamped.
export async function previewReceiptPdf(
  entryId: string,
  societyId: string,
): Promise<Buffer | null> {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: entryId, flat: { societyId } },
    include: RECEIPT_ENTRY_INCLUDE,
  });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  const society = await prisma.society.findUniqueOrThrow({
    where: { id: societyId },
    include: { chairman: { select: { name: true } }, secretary: { select: { name: true } } },
  });
  assertSignaturesConfigured(society);
  const otherChargeFeeTypeNames =
    entry.category === 'OTHER_CHARGE'
      ? (await getOpenOtherCharges(entry.flatId)).feeTypeNames
      : undefined;
  const data = buildReceiptData(entry, entry.flat, entry.payer, society, {
    date: new Date(),
    otherChargeFeeTypeNames,
  });
  const signatures = await getCommitteeSignatures(society);
  return renderReceiptPdf(data, signatures);
}

// Renders and saves the receipt file — called by both approveLedgerEntry and
// manualDeposit, before their transactions open. Returns just enough for the
// caller to create the Receipt row itself.
export async function prepareReceiptForEntry(
  entry: ReceiptEntry,
  flat: ReceiptFlat,
  payer: ReceiptPayer,
  society: ReceiptSociety,
  issuedAt: Date,
  otherChargeFeeTypeNames?: string[],
): Promise<{ receiptNumber: string; fileKey: string }> {
  assertSignaturesConfigured(society);
  const data = buildReceiptData(entry, flat, payer, society, { date: issuedAt, otherChargeFeeTypeNames });
  const signatures = await getCommitteeSignatures(society);
  const pdfBuffer = await renderReceiptPdf(data, signatures);
  const { key } = await getStorageAdapter().save({
    buffer: pdfBuffer,
    societyId: society.id,
    extension: '.pdf',
  });
  return { receiptNumber: data.receiptNumber, fileKey: key };
}

// Authenticated download of an already-issued receipt — admin or the entry's own
// payer. Returns null for not-found/wrong-society/no-receipt-yet; a legacy entry
// is never lazily backfilled with a fabricated receipt.
export async function getIssuedReceiptForViewing(
  entryId: string,
  requesterId: string,
  requesterRole: Role,
  societyId: string,
): Promise<{ stream: Readable; mimeType: string } | null> {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: entryId, flat: { societyId } },
    include: { receipt: true },
  });
  if (!entry || !entry.receipt) return null;

  if (requesterRole !== 'ADMIN' && entry.payerId !== requesterId) {
    throw new ForbiddenLedgerEntryAccessError();
  }

  const stream = await getStorageAdapter().read(entry.receipt.fileKey);
  return { stream, mimeType: 'application/pdf' };
}
