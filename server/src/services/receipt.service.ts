import type { Readable } from 'node:stream';
import type { LedgerType, Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { ForbiddenLedgerEntryAccessError, LedgerEntryAlreadyReviewedError } from '../lib/errors';
import { renderReceiptPdf, type ReceiptData } from '../lib/receipt-pdf';
import { getStorageAdapter } from '../lib/storage';

// Minimal shapes this file actually reads — not the full generated Prisma model
// types, matching this codebase's existing convention (services only import
// enums from '../generated/prisma/client', never full model types; see
// ledger.service.ts/flats.service.ts).
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
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  receiptSignatureFileKey: string | null;
}

interface ReceiptEntry {
  id: string;
  type: LedgerType;
  amount: unknown; // Prisma Decimal — always passed through Number() before use
  note: string | null;
  payerId: string;
}

// Computable purely from the flat + the LedgerEntry's own (already-existing) id —
// no shared counter, no race. This is what guarantees the number shown in the
// pre-approval preview and the number actually issued on approval can never
// disagree (see receipt.service.ts's previewReceiptPdf vs. prepareReceiptForEntry).
export function buildReceiptNumber(prefix: string, flat: ReceiptFlat, ledgerEntryId: string): string {
  return `${prefix}-${flat.wing}${flat.flatNumber}-${ledgerEntryId}`;
}

// Purpose text is a generic label per type, not an itemized per-month breakdown
// (confirmed scope decision) — Deposit is never tied to specific MaintenanceRecords
// under the ledger pivot, and Credit already carries its own required reason in
// `note`.
function buildPurposeLabel(entry: ReceiptEntry): string {
  if (entry.type === 'DEPOSIT') return 'Maintenance dues payment';
  return entry.note ?? 'Committee-approved credit adjustment';
}

export function buildReceiptData(
  entry: ReceiptEntry,
  flat: ReceiptFlat,
  payer: ReceiptPayer,
  society: ReceiptSociety,
  opts: { date: Date },
): ReceiptData {
  return {
    receiptNumber: buildReceiptNumber(society.receiptNumberPrefix, flat, entry.id),
    societyName: society.name,
    societyAddress: society.address,
    residentName: payer.name,
    flatLabel: `${flat.wing}-${flat.flatNumber}`,
    date: opts.date,
    transactionType: entry.type,
    purpose: buildPurposeLabel(entry),
    // Rule: always the amount already stored on the entry at creation time, never
    // recomputed from current billing settings — see CLAUDE.md's "RATE CALCULATION
    // RULE" for the receipt feature. LedgerEntry.amount is set once at creation and
    // never mutated by approve/reject (ledger.service.ts), so reading it directly
    // here already satisfies that rule with no extra bookkeeping.
    amount: Number(entry.amount),
    signatoryName: society.receiptSignatoryName ?? undefined,
    signatoryTitle: society.receiptSignatoryTitle ?? undefined,
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

// A broken/missing signature file must never block a financial transaction from
// settling — catches any read failure and falls back to `undefined` (the
// blank-signature-line rendering in receipt-pdf.ts), logging a warning rather than
// throwing.
export async function getSignatureBufferOrUndefined(
  society: Pick<ReceiptSociety, 'receiptSignatureFileKey'>,
): Promise<Buffer | undefined> {
  if (!society.receiptSignatureFileKey) return undefined;
  try {
    const stream = await getStorageAdapter().read(society.receiptSignatureFileKey);
    return await streamToBuffer(stream);
  } catch (err) {
    console.warn(`[receipt] could not read signature file, rendering without one: ${(err as Error).message}`);
    return undefined;
  }
}

const RECEIPT_ENTRY_INCLUDE = {
  flat: { select: { wing: true, flatNumber: true } },
  payer: { select: { name: true } },
} as const;

// Preview for the admin's approval modal — the requirement is "showing the *exact*
// receipt that will be issued," so this reuses the exact same buildReceiptData +
// renderReceiptPdf path the real approval uses (see ledger.service.ts's
// prepareReceiptForEntry), guaranteeing byte-for-byte WYSIWYG. Deliberately has no
// side effects: no storage.save(), no DB write — nothing is "issued" until the
// admin actually confirms approval.
export async function previewReceiptPdf(entryId: string, societyId: string): Promise<Buffer | null> {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: entryId, flat: { societyId } },
    include: RECEIPT_ENTRY_INCLUDE,
  });
  if (!entry) return null;
  if (entry.status !== 'PENDING') throw new LedgerEntryAlreadyReviewedError();

  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });
  const data = buildReceiptData(entry, entry.flat, entry.payer, society, { date: new Date() });
  const signatureBuffer = await getSignatureBufferOrUndefined(society);
  return renderReceiptPdf(data, signatureBuffer);
}

// Renders and saves the actual receipt file — called by both approveLedgerEntry
// and manualDeposit, *before* their respective $transactions open (same
// "write the file, then commit the row" ordering already used elsewhere in this
// codebase for Deposit/Credit proof uploads). Returns just enough for the caller
// to create the Receipt row itself inside its transaction.
export async function prepareReceiptForEntry(
  entry: ReceiptEntry,
  flat: ReceiptFlat,
  payer: ReceiptPayer,
  society: ReceiptSociety,
  issuedAt: Date,
): Promise<{ receiptNumber: string; fileKey: string }> {
  const data = buildReceiptData(entry, flat, payer, society, { date: issuedAt });
  const signatureBuffer = await getSignatureBufferOrUndefined(society);
  const pdfBuffer = await renderReceiptPdf(data, signatureBuffer);
  const { key } = await getStorageAdapter().save({ buffer: pdfBuffer, societyId: society.id, extension: '.pdf' });
  return { receiptNumber: data.receiptNumber, fileKey: key };
}

// Authenticated download of an already-issued receipt — admin or the entry's own
// payer (owner or tenant, symmetric), same auth shape as
// ledger.service.ts's getLedgerEntryFileForViewing. Returns null for "not found,
// wrong society, or no Receipt row yet" (404) — a legacy entry approved before
// this feature shipped is not lazily backfilled with a fabricated receipt.
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
