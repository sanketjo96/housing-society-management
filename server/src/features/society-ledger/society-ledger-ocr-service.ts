// Admin-side OCR assist for Manage Finance: infer a bank/UPI transaction
// reference from the proof file the admin is about to attach, before the
// SocietyLedgerEntry even exists — read-only, never writes anything; the admin
// still confirms/edits the pre-filled reference before submitting. Reuses the
// same OCR engine/extractor as the Deposit-approval infer button
// (ledger/admin/admin-ledger-ocr-service.ts), just against a fresh upload
// buffer instead of an already-stored file.
import { logger } from '../../infrastructure/observability';
import { recognizeText } from '../../infrastructure/ocr/tesseract-ocr-engine';
import { extractBankReference } from '../../shared/billing/bank-reference-extractor';

const OCR_SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Never throws — a PDF, a corrupted image, or an OCR pass that finds nothing
// all resolve to bankReference: null, same "must never block" precedent as the
// rest of this feature.
export async function inferBankReferenceFromUpload(
  buffer: Buffer,
  mimeType: string,
): Promise<{ bankReference: string | null }> {
  if (!OCR_SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return { bankReference: null };
  }

  try {
    const text = await recognizeText(buffer);
    return { bankReference: extractBankReference(text) };
  } catch (err) {
    logger.child({ feature: 'society-ledger' }).warn({ err }, 'bank-reference OCR pass failed');
    return { bankReference: null };
  }
}
