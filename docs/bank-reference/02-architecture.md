# Bank Reference Capture — Architecture

## Design Principle
Bank reference capture is **purely additive metadata** on `LedgerEntry` — never a
balance-affecting field, never a new settlement input, never a reason to touch
`ledger-shared.ts`. `balancesFromRows`, `computeRecordSettlements`, and
`computeFlatBalances` are confirmed unchanged: none of them read `bankReference`
or `bankReferenceSource`, and none of them ever will, since this field exists
only to make an already-settled row traceable to a real bank transaction, not to
influence whether or how much it settles.

## Data Model

```prisma
// Tracks how LedgerEntry.bankReference came to be — same "track how a row came
// to be, not just its value" precedent as CreatedByType. OCR extraction is a
// convenience pre-fill only; this is what lets an auditor or admin tell "the
// resident never touched this — it's exactly what the app read off the
// screenshot" apart from "the resident typed or corrected this by hand" (an
// admin's manualDeposit entry is also MANUAL_ENTRY — CreatedByType already
// disambiguates *who* created the row, this enum only answers *how* the
// reference value was arrived at).
enum BankReferenceSource {
  OCR_EXTRACTED
  MANUAL_ENTRY
}

model LedgerEntry {
  // ...existing fields unchanged...

  // UPI transaction ID / UTR / cheque number — the piece of evidence that makes
  // bank-statement reconciliation tractable at audit time. Optional at every
  // layer (DB, submission, review) — must never block a Deposit from settling,
  // same "a broken decorative image must never block a financial transaction
  // from settling" precedent as the receipt signature fallback
  // (docs/receipts.md). Meaningful for type=DEPOSIT rows only — a Credit is a
  // non-cash committee-approved adjustment, no bank transaction ever occurs, so
  // this stays null on every Credit row. Every reconciliation/audit query must
  // filter `type='DEPOSIT' AND status='APPROVED'` — Deposit and Credit are
  // audit-different but schema-identical, a risk explicitly flagged and
  // designed against here, not repeated.
  bankReference       String?
  bankReferenceSource BankReferenceSource?

  // ...rest unchanged...
}
```

**Why nullable at every layer, not a required column**: identical reasoning to
`fileUrl`/`mimeType` already on this model — a Deposit's screenshot is optional,
and this field sits one layer further inside that already-optional flow (no
screenshot means no OCR run and nothing to pre-fill, but a resident can still
type a reference from memory with no screenshot at all).

**Why an enum companion field, not a boolean `isOcrExtracted`**: mirrors
`CreatedByType`'s existing precedent (`OWNER | TENANT | ADMIN`, not three
booleans) — an enum leaves room for a future third state (e.g. a real
bank-matching integration's `BANK_VERIFIED`, see `05-future-scope.md`) without a
second migration touching a boolean column.

Migration name: `add_ledger_entry_bank_reference`. Every existing row backfills
both columns to `NULL` — zero behavior change, same safe-backfill pattern
`LedgerCategory`'s `@default(MAINTENANCE)` and `createdByType`'s own migration
already established.

## OCR Module

```
server/src/infrastructure/ocr/
  tesseract-ocr-engine.ts     — wraps tesseract.js, recognizeText(buffer): Promise<string>
  bank-reference-ocr.ts       — orchestrates: mimeType gate → recognizeText → extractBankReference
server/src/shared/billing/
  bank-reference-extractor.ts — pure regex heuristics, extractBankReference(text): string | null
```

`tesseract-ocr-engine.ts` — self-hosted, zero external API cost (matches this
app's "low operating cost" NFR). Never throws: any failure (corrupt image,
worker init error) is logged and swallowed, returning `''`. OCR is a convenience
pre-fill only — its failure must never surface as an error to the resident, let
alone block a financial transaction from settling.

`shared/billing/bank-reference-extractor.ts` — heuristic regexes for the wording
each major UPI app's confirmation screen uses, tried in order, first match wins:
Google Pay's "UPI transaction ID," PhonePe's "Transaction ID," Paytm's "UPI Ref
No," and a bare 12-digit UTR pattern as the final fallback for a screenshot that
doesn't name its app explicitly. Pure, no I/O — unit-testable by feeding raw
strings directly, with no dependency on the OCR engine itself.

`infrastructure/ocr/bank-reference-ocr.ts` — gates on mime type
(`image/jpeg`/`image/png`/`image/webp` only; a PDF proof is deliberately not
rasterized for OCR in v1, see Non-Goals below) and chains `recognizeText` →
`extractBankReference`.

New dependency: `tesseract.js`.

## Request Flow — submission (with OCR pre-fill)

```
Resident picks/drops a screenshot in PayIntentPanel
        │
        ▼
POST /api/me/ledger/deposits/ocr-extract  (multipart: file)
  - verifyFileSignature (existing magic-byte sniff, unchanged)
  - extractBankReferenceFromImage(buffer, sniffedMimeType)
  - no DB write, no storage write, no AuditLog row — nothing has happened yet
        │
        ▼
{ bankReference: "402917563210" | null }
        │
        ▼
Editable text input pre-filled (or left blank on null/failure — never an error
banner; OCR having nothing to say is a normal, silent outcome)
        │
        ▼
Resident reviews/edits/clears/retypes, then submits the intent
        │
        ▼
POST /api/me/ledger/deposits/intent/submit  (backs submitPaymentIntent)
  (multipart: file [same file, re-sent] + bankReference [current field text])
        │
        ▼
submitPaymentIntent(...):
  - storage.save(file)  (unchanged)
  - re-run extractBankReferenceFromImage(buffer, mimeType) server-side
  - compare resident's submitted text (trimmed, case-insensitive) to the
    server's own extraction:
      equal & non-empty      → bankReferenceSource = OCR_EXTRACTED
      non-empty, not equal   → bankReferenceSource = MANUAL_ENTRY
      empty                  → bankReference/bankReferenceSource = null
  - tx.ledgerEntry.create({ ..., bankReference, bankReferenceSource })
  - tx.auditLog.create(...)  (unchanged)
  - tx.paymentIntent.delete(...)  (unchanged)
        │
        ▼
LedgerEntry created, PENDING, category inherited from the intent (unchanged)
```

**Key decision — provenance is server-computed, never client-declared.** The
client only ever sends the final text; it never sends `bankReferenceSource`
itself. The server independently re-runs the same deterministic, zero-cost OCR
pass against the same buffer and diffs it against what the resident actually
submitted. `bankReferenceSource` can therefore never be spoofed into falsely
claiming `OCR_EXTRACTED` — which matters precisely because `APPROVED` later
treats that value as implicitly admin-vouched-for (§ Approval flow, below).
Running OCR twice (once for the preview, once again at submit) is deliberately
accepted as harmless — `tesseract.js` is self-hosted with no per-call cost, and
this app already re-validates amount caps server-side on the same "never trust
the client" principle.

`createDeposit` (the lower-level, currently-unwired one-shot primitive) gets the
identical treatment for consistency — `Should`, not `Must`, since its frontend
button has no wired behavior today; skipping it would leave one Deposit-creation
path inconsistent for no reason.

`createCredit`: unchanged. `bankReference` stays inapplicable to `CREDIT` rows
entirely, per the confirmed scope boundary.

## `manualDeposit` path — direct admin entry, no OCR

No screenshot is ever uploaded through this path (it exists precisely because
there isn't one), so no OCR step applies — this is the one path where the admin
is trusted to type the reference directly, the same way they're already trusted
to type the amount and pick the flat.

```ts
// admin-ledger-service.ts
export async function manualDeposit(
  societyId: string,
  adminId: string,
  flatId: string,
  amount: number,
  category: LedgerCategory = 'MAINTENANCE',
  bankReference?: string,          // NEW — optional, admin-typed
) {
  // ...unchanged validation/flat/payer resolution...
  const trimmed = bankReference?.trim() || undefined;

  // ...inside the transaction's ledgerEntry.create data:...
  bankReference: trimmed,
  bankReferenceSource: trimmed ? 'MANUAL_ENTRY' : undefined,
```

## Request Flow — approval (display only, no re-entry)

```
Admin clicks "Approve" on a PENDING Deposit row (PaymentProofsPage.tsx)
        │
        ▼
ReceiptApprovalModal opens, fetching two things in parallel:
  - GET /api/admin/ledger-entries/:id/receipt-preview  (unchanged — PDF blob)
  - GET /api/ledger-entries/:id/file                   (existing endpoint,
    NEW caller — proof screenshot blob, only if entry.fileUrl is set)
        │
        ▼
Modal renders: [ proof screenshot thumbnail (or "No file attached") ]
               [ "Payment reference: 402917563210" — bankReference, read-only,
                 or "No reference captured" if null — never an input field ]
               [ receipt PDF preview, as today ]
        │
        ▼
Admin visually cross-checks reference against screenshot, no typing
        │
        ▼
"Confirm and approve" → existing approve endpoint, UNCHANGED — bankReference /
bankReferenceSource already sit on the row from submission time; approval only
flips status, nothing about the reference is written or re-derived here
```

**Why this needs zero backend change to the approve endpoint itself**:
`bankReference`/`bankReferenceSource` were already persisted at submission time.
`approveLedgerEntry` only flips `status → APPROVED` — the trust upgrade from
"resident-submitted, unverified" to "implicitly vouched for" is a pure semantic
reading of the already-persisted `(type, status)` pair by any downstream
reconciliation query, not a new column write. Same "the receipt number is fully
computable in advance" style of design already used elsewhere in this feature
area — nothing new to keep in sync at approval time.

`bankReference` is already a plain scalar returned wherever a `LedgerEntry` row
is selected (no `include` change needed, same reasoning `createdByType`'s own
code comment documents) — the approval modal receives it straight through as a
prop, no extra fetch required for the value itself; only the proof-screenshot
*file bytes* are a new fetch inside the modal.

## Frontend Architecture

| Surface | Pattern reused |
|---|---|
| `PayIntentPanel.tsx` | On file select, calls the new OCR-extract endpoint and pre-fills an editable "Bank reference / UPI transaction ID (optional)" field alongside the existing `FileUploadField` |
| `ReceiptApprovalModal.tsx` | Gains a proof-screenshot pane and read-only reference display alongside the existing PDF preview |
| `admin/PaymentProofsPage.tsx` | New Reference column on the table; `MarkAsPaidModal` gains a "Bank reference / UTR (optional)" text field, same single-submit form as today |
| `admin/ReceiptBookPage.tsx` | New "Bank reference" column; existing client-side free-text search extended to also match it |
| `ResidentDashboardOverview.tsx` | Passbook's `LedgerRow` shows `bankReference` on the resident's own Deposit rows, same secondary-text treatment a Credit's `note` already gets |

## Key Architectural Decisions
1. **Provenance is always server-computed, never client-declared.** The only way
   `bankReferenceSource` is ever set is by the server independently re-running
   OCR and diffing — this is a deliberate trust boundary, not a placeholder for
   a future "just trust the client" simplification.
2. **OCR failure is a silent no-op, never an error.** Identical precedent to the
   receipt signature-render fallback — a decorative/convenience feature must
   never block a financial transaction from settling.
3. **`bankReference` is meaningful for `type=DEPOSIT` rows only.** Every
   reconciliation or audit query must filter `type='DEPOSIT' AND
   status='APPROVED'` — this is stated explicitly here because it was an actual
   finding from the audit-readiness review this feature exists to address, not
   an incidental detail.
4. **The approval endpoint needs zero changes.** Nothing new is written when a
   Deposit is approved — the reference was already captured at submission; only
   its *meaning* (unverified → implicitly admin-vouched-for) shifts, and that's
   a read-time interpretation, not a write.
5. **PDFs are excluded from OCR in v1.** Rasterizing a PDF proof for OCR would
   need a new dependency this app doesn't otherwise carry, for a case (PDF
   screenshots) that's uncommon for UPI payment confirmations.
