// Admin-side OCR assist: infer a bank/UPI reference from a Deposit's own already-
// uploaded proof screenshot, on demand (admin clicks "Infer"). Read-only — never
// writes bankReference itself; the admin still confirms/edits before approving
// (docs/features/bank-reference/01-requirements.md, phase 1's admin-typed-at-
// approval model). Distinct from the resident-submission-time OCR-extract flow
// described in that doc's Epic 3 — that path isn't built; this is a smaller,
// admin-only slice reusing the same OCR engine/extractor.
import type { Readable } from 'node:stream';
import { prisma } from '../../../infrastructure/prisma/client';
import { logger } from '../../../infrastructure/observability';
import { getStorageAdapter } from '../../../infrastructure/storage';
import { recognizeText } from '../../../infrastructure/ocr/tesseract-ocr-engine';
import { extractBankReference } from '../../../shared/billing/bank-reference-extractor';

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

const OCR_SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Returns null only for "entry not found or not in this society" (404 at the
// controller). Every other outcome — no file, a PDF proof, an OCR pass that finds
// nothing — resolves to `{ bankReference: null }`, never an error: OCR assist
// must never block the admin from typing the reference manually.
export async function inferBankReferenceForEntry(
  entryId: string,
  societyId: string,
): Promise<{ bankReference: string | null } | null> {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: entryId, flat: { societyId } },
    select: { fileUrl: true, mimeType: true },
  });
  if (!entry) return null;

  if (!entry.fileUrl || !entry.mimeType || !OCR_SUPPORTED_MIME_TYPES.includes(entry.mimeType)) {
    return { bankReference: null };
  }

  const stream = await getStorageAdapter().read(entry.fileUrl);
  const buffer = await streamToBuffer(stream);

  // A corrupted/unusual image failing to decode is a real, expected outcome
  // (not just a hypothetical) — degrade to "nothing found" rather than a 500, same
  // "must never block" precedent as the rest of this feature.
  try {
    const text = await recognizeText(buffer);
    return { bankReference: extractBankReference(text) };
  } catch (err) {
    logger.child({ feature: 'ledger' }).warn({ err, entryId }, 'bank-reference OCR pass failed');
    return { bankReference: null };
  }
}
