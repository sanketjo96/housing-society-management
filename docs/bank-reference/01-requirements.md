# Bank Reference Capture — Requirements

## Context
- App: Society management system (24 flats, 2 personas — Admin, Resident)
- A financial-audit-readiness review of the schema (model-by-model, against the six
  criteria a yearly audit actually checks) flagged `LedgerEntry` as the single
  biggest reconciliation gap: a Deposit has no field tying it to an actual bank/UPI
  transaction, only an optional screenshot and an amount/date.
- Goal: capture a bank/UPI transaction reference on every Deposit, assisted by
  OCR against the screenshot the resident already uploads, so that an approved
  Deposit is actually reconcilable against the society's real bank statement —
  without adding friction to the Pay flow or a new manual step for the admin.

## Problem Statement
An auditor reconciling the society's bank account currently has nothing but an
amount and a submission date to match a `LedgerEntry` row against a real bank
statement line. A screenshot is optional and, even when present, is not
structured data — it can't be searched, sorted, or ticked off programmatically.
This becomes unworkable past a handful of transactions, and is ambiguous the
moment two residents pay the same amount on the same day.

## Confirmed Product Decisions
These were explicitly settled (not defaults) during design discussion and should
not be re-litigated without a new conversation:

1. **OCR-assisted capture, not manual-only.** The server runs self-hosted OCR
   (no paid external API) against the screenshot the resident already uploads and
   attempts to extract a transaction reference automatically, pre-filling an
   editable field — the resident is not asked to hunt for and type a UTR from
   scratch.
2. **OCR must never block submission.** A failed or empty extraction leaves the
   field blank with no error shown — the resident can still type a reference
   manually, or submit with none at all. Same "must never block a financial
   transaction from settling" precedent already established for the receipt
   signature-render fallback (`docs/receipts.md`).
3. **The field is optional at every layer** — schema, submission, and review.
   Not every Deposit will have a usable reference (a poor screenshot, an app OCR
   doesn't recognize), and that must never be a hard stop.
4. **Provenance is always server-computed, never client-declared.** The server
   independently re-runs its own OCR pass at submission time and diffs it
   against whatever the resident actually submitted, to record whether the value
   is an untouched OCR extraction or a manual/edited entry. A client can never
   directly assert "this came from OCR."
5. **The admin never re-types the reference at approval.** It's simply displayed
   next to the proof screenshot in the existing receipt-approval preview modal
   (`docs/receipts.md`'s "Approval flow") — the admin visually cross-checks and
   clicks "Confirm and approve," exactly as today, with one more piece of
   context on screen.
6. **`manualDeposit` (the admin cash/bank-transfer fallback) gets direct admin
   entry, not OCR.** There is no screenshot in that path by definition, so the
   admin who is already recording the transaction types the reference directly.
7. **Meaningful for `type: DEPOSIT` rows only.** A Credit is a non-cash,
   committee-approved adjustment — no bank transaction ever occurs for one, so
   this field is never offered or populated on a Credit. Every reconciliation or
   audit query against this field must filter `type='DEPOSIT' AND
   status='APPROVED'` — this was an explicit finding from the audit-readiness
   review ("Deposit and Credit are audit-different but schema-identical") that
   this feature is designed to not repeat.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | `LedgerEntry` gains an optional `bankReference` field, meaningful only on `type=DEPOSIT` rows | Must |
| R2 | `LedgerEntry` gains a `bankReferenceSource` enum (`OCR_EXTRACTED` \| `MANUAL_ENTRY`) tracking provenance, computed server-side — never a client-declared value | Must |
| R3 | On screenshot upload in the Pay flow, the server runs self-hosted OCR and attempts extraction via per-UPI-app regex heuristics before the resident's final submit | Must |
| R4 | The extracted value pre-fills an editable text field; the resident may accept, edit, clear, or type a value from scratch — this must never block or delay Deposit submission | Must |
| R5 | A failed or empty OCR extraction leaves the field blank with no error shown to the resident — a normal, silent outcome, not a failure state | Must |
| R6 | Any Deposit reconciliation/audit query must filter `type='DEPOSIT' AND status='APPROVED'` — `bankReference` is not meaningful on `CREDIT` rows or on `PENDING`/`REJECTED` Deposits for reconciliation purposes | Must |
| R7 | On approval, the admin sees `bankReference` displayed next to the proof screenshot inside the existing receipt-approval preview modal, read-only — no re-typing or separate confirmation step required | Must |
| R8 | `manualDeposit` lets an admin type a `bankReference` directly (no OCR, no screenshot involved in this path) | Must |
| R9 | Receipt Book (`GET /api/admin/receipts` + `ReceiptBookPage.tsx`) surfaces `bankReference` as a column and includes it in the existing free-text search | Must |
| R10 | The resident's own Passbook shows their submitted `bankReference` on their own Deposit rows | Should |
| R11 | PDF proof uploads are not OCR'd in v1 (image mime types only) — a PDF proof simply gets no pre-fill | Should |

## Non-Functional Requirements
- **Low operating cost**: OCR runs via a self-hosted library (`tesseract.js`), no
  external/paid API call — matching this app's existing "low operating cost" NFR,
  already true of `qrcode` for UPI QR generation and the `local` storage adapter.
- **Never blocks a financial transaction**: any OCR failure degrades silently to a
  blank, resident-editable field — identical precedent to the receipt-signature
  render fallback documented in `docs/receipts.md`.
- **No new trust surface**: provenance (`bankReferenceSource`) is always computed
  from the server's own independent OCR re-run, never accepted as a value the
  client asserts about itself.
- **Zero change to balance/settlement math**: `balancesFromRows`,
  `computeRecordSettlements`, and `computeFlatBalances` (`ledger-shared.ts`) are
  untouched — this field is purely additive metadata that never enters a
  balance or settlement calculation.

## Explicitly Out of Scope (v1)
- Real bank-statement matching or open-banking API verification against actual
  bank records — this only captures a self-reported (OCR-assisted) reference, it
  does not independently confirm it against the bank.
- A new `SocietyLedgerEntry`/`SocietyTransaction` model for society-initiated
  income/expense (money the society itself pays out or receives that isn't tied
  to any specific flat) — a separate, larger, not-yet-designed feature, unrelated
  to this one beyond both surfacing in the same audit-readiness review.
- OCR of PDF proof uploads (would require a PDF-rasterization dependency this app
  doesn't otherwise carry).
- Any dedicated "auditor export" UI beyond the existing, extended Receipt Book.

These are tracked with their trigger conditions in
[`05-future-scope.md`](./05-future-scope.md) — revisit only if a concrete need
appears, not on a schedule.

## Success Criteria
- A resident uploading a GPay/PhonePe/Paytm screenshot sees a pre-filled bank
  reference field without typing anything, still freely editable, and submission
  is never blocked whether or not extraction succeeded.
- An admin approving a Deposit sees the reference displayed next to the proof
  screenshot in the same modal they already use, with zero re-entry required.
- Every approved Deposit is reconciliation-ready: Receipt Book shows the
  reference as a column and it's searchable there, giving an auditor a real
  field to tick off against the bank statement instead of eyeballing amount and
  date alone.
