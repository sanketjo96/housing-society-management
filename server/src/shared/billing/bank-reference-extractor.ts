// Regex heuristics for pulling a bank/UPI transaction reference out of OCR text
// from a UPI-app payment-confirmation screenshot (GPay/PhonePe/Paytm) or a bank
// transfer receipt. Never throws — an unrecognized or empty input just returns
// null, matching this feature's "OCR must never block a financial transaction"
// rule (docs/features/bank-reference/01-requirements.md, R2/R5).
const LABELED_PATTERNS: RegExp[] = [
  // GPay ("UPI transaction ID"), Paytm ("UPI Ref No."/"UPI reference ID").
  /UPI\s*(?:transaction\s*id|ref(?:erence)?\s*(?:no\.?|id))\s*[:-]?\s*([A-Za-z0-9]{9,25})/i,
  // PhonePe ("Transaction ID T..."), also matches "Google transaction ID".
  /transaction\s*id\s*[:-]?\s*([A-Za-z0-9]{9,25})/i,
  // Bank-transfer receipts.
  /UTR\s*(?:no\.?|number)?\s*[:-]?\s*([A-Za-z0-9]{9,25})/i,
];

// Fallback when no label is recognized — UTR/UPI references are conventionally a
// bare 12-digit number.
const BARE_REFERENCE_PATTERN = /\b(\d{12})\b/;

export function extractBankReference(text: string): string | null {
  if (!text) return null;

  for (const pattern of LABELED_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  const bare = text.match(BARE_REFERENCE_PATTERN);
  return bare ? bare[1] : null;
}
