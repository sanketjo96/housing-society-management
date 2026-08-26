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

// Minimal shapes this file actually reads — not the full generated Prisma model
// types, matching this codebase's existing convention (services only import
// enums from '../../infrastructure/prisma/generated/client', never full model types; see
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
  receiptFooterNote: string | null;
  // Chairman/Secretary now sign every receipt (2026-08-17), replacing the single
  // treasurer signatory — see CLAUDE.md's addendum. Name comes from the actual
  // committee-member User record (Society.chairman/secretary), not free text; the
  // signature image is the same opaque key set from the Committee tab.
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

// Computable purely from the flat + the LedgerEntry's own (already-existing) id —
// no shared counter, no race. This is what guarantees the number shown in the
// pre-approval preview and the number actually issued on approval can never
// disagree (see receipt.service.ts's previewReceiptPdf vs. prepareReceiptForEntry).
//
// Only the last 8 characters of the (cuid) ledgerEntryId are used, to keep the
// printed number short and readable — full uniqueness isn't needed from this
// suffix alone, since `Receipt.receiptNumber` is still `@unique` at the schema
// level (prisma/schema.prisma) and would fail loudly on the astronomically
// unlikely event of a collision, same safety net every other unique field in
// this app already relies on.
export function buildReceiptNumber(
  prefix: string,
  flat: ReceiptFlat,
  ledgerEntryId: string,
): string {
  const shortId = ledgerEntryId.slice(-8);
  return `${prefix}-${flat.wing}${flat.flatNumber}-${shortId}`;
}

// Purpose text is a generic label per category, not an itemized per-month breakdown
// for Maintenance (confirmed scope decision) — a Deposit is never tied to specific
// MaintenanceRecords under the ledger pivot. For OTHER_CHARGE, though, the fee
// type(s) this Deposit actually settled ARE knowable (2026-08-24 addition — see
// OtherCharge.settledByLedgerEntryId's schema comment) and are folded into the
// purpose line when supplied: "Transfer Fee payment" (one), "Transfer Fee, Parking
// Fine payment" (several), falling back to the original generic "Other charges
// payment" when none are supplied — which is exactly what happens for a legacy
// entry approved before this shipped (never backfilled, same convention as this
// feature's 2026-08-11 legacy-entry handling). Credit (a separate,
// resident-requested adjustment type) was removed for good 2026-08-20 — every
// LedgerEntry is a Deposit now, so there's no separate Credit branch here.
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
    // Rule: always the amount already stored on the entry at creation time, never
    // recomputed from current billing settings — see CLAUDE.md's "RATE CALCULATION
    // RULE" for the receipt feature. LedgerEntry.amount is set once at creation and
    // never mutated by approve/reject (ledger.service.ts), so reading it directly
    // here already satisfies that rule with no extra bookkeeping.
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

// A broken/missing signature file must never block a financial transaction from
// settling — catches any read failure and falls back to `undefined` (the
// blank-signature-line rendering in receipt-pdf.ts), logging a warning rather than
// throwing. Takes a raw file key (not a society object) so the same function
// serves both the chairman and secretary signature slots.
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

// Fetches both signature images in parallel — either may be undefined (role
// unassigned, no signature uploaded, or an unreadable file, all handled the same
// way by getSignatureBufferOrUndefined above).
async function getCommitteeSignatures(
  society: Pick<ReceiptSociety, 'chairmanSignatureFileKey' | 'secretarySignatureFileKey'>,
) {
  const [chairman, secretary] = await Promise.all([
    getSignatureBufferOrUndefined(society.chairmanSignatureFileKey),
    getSignatureBufferOrUndefined(society.secretarySignatureFileKey),
  ]);
  return { chairman, secretary };
}

// A receipt with a completely blank signatory block (no Chairman signature, no
// Secretary signature) is not acceptable — an admin must configure at least one
// before any Deposit can be approved. Deliberately checked against the raw file
// keys, not signature *bytes* — a broken/unreadable file at render time still
// falls back to a blank line silently (getSignatureBufferOrUndefined, unchanged;
// that's a different, narrower concern than "nothing was ever configured").
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

// "Still outstanding" for an OtherCharge is exactly settledByLedgerEntryId IS NULL
// (see the schema comment) — this is the one query both the read-only preview and
// the real approve/manualDeposit paths use to find out which charges a soon-to-be-
// approved Deposit is about to settle. Exported so admin-ledger-service.ts can
// reuse the same `ids` list to actually stamp those rows inside its own
// transaction, rather than this file doing that write itself (approveLedgerEntry/
// manualDeposit own their transactions; this file only ever reads).
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

// Preview for the admin's approval modal — the requirement is "showing the *exact*
// receipt that will be issued," so this reuses the exact same buildReceiptData +
// renderReceiptPdf path the real approval uses (see ledger.service.ts's
// prepareReceiptForEntry), guaranteeing byte-for-byte WYSIWYG. Deliberately has no
// side effects: no storage.save(), no DB write — nothing is "issued" until the
// admin actually confirms approval, and no OtherCharge row is stamped here either
// (see getOpenOtherCharges above).
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

// Renders and saves the actual receipt file — called by both approveLedgerEntry
// and manualDeposit, *before* their respective $transactions open (same
// "write the file, then commit the row" ordering already used elsewhere in this
// codebase for Deposit/Credit proof uploads). Returns just enough for the caller
// to create the Receipt row itself inside its transaction. `otherChargeFeeTypeNames`
// is optional and only meaningful for an OTHER_CHARGE entry — the caller already
// ran getOpenOtherCharges (it needs the `ids` too, to stamp them), so this file
// doesn't re-query.
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
