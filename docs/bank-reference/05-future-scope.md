# Bank Reference Capture — Future Scope

Everything below is **deliberately not built in v1**. Documented so the path is
clear if a real need appears — not so it gets scheduled prematurely. Re-read
[`01-requirements.md`](./01-requirements.md) before starting any item here to
confirm the trigger is real, not anticipated (same discipline
`docs/other-charges/05-future-scope.md` applies to its own deferred items).

## 1. Real Bank-Statement Matching / Open-Banking Integration
**What**: verify a submitted `bankReference` against actual bank records via an
open-banking API or an imported bank statement, auto-flagging mismatches
instead of relying on an admin's visual cross-check in the approval modal.
**Trigger**: a real audit incident where self-reported references alone prove
insufficient — e.g. a resident's stated reference turns out fabricated or
mismatched, discovered only during a manual bank-statement audit.
**Why not now**: explicitly confirmed out of scope for this feature — a much
larger integration surface (bank API credentials, statement parsing, matching
logic) than "capture and display."
**Cost to add**: large — a new external integration, credential/compliance
handling, and a reconciliation-matching engine. `bankReferenceSource` would
likely gain a third state (`BANK_VERIFIED`) at that point, which is exactly why
it's an enum and not a boolean today.

## 2. `SocietyLedgerEntry` / `SocietyTransaction` (society-initiated income/expense)
**What**: a separate ledger for money the society itself pays out or receives
that isn't tied to any specific flat — vendor payments, salaries, bank
interest, common-area rental income.
**Trigger**: a concrete need for tracking non-flat-tied cash flow surfaces.
**Why not now**: a separate, larger, not-yet-designed feature — out of scope
for this doc set entirely, and unrelated to bank-reference capture beyond both
surfacing from the same audit-readiness review. `LedgerEntry` requires
`flatId`/`payerId`, so this genuinely can't be bolted onto the existing model.
**Cost to add**: large — a new model, a new balance concept entirely distinct
from the flat-scoped Outstanding/Available Credit pair this feature extends.

## 3. PDF-Proof OCR
**What**: rasterize a PDF proof upload so it can be OCR'd the same way an image
screenshot is today.
**Trigger**: PDF proofs turn out to be common enough in practice that skipping
them leaves a real, frequently-hit gap (uncommon for UPI payment confirmations,
which are almost always screenshots).
**Why not now**: needs a PDF-to-image rasterization dependency this app doesn't
otherwise carry, for a case that's expected to be rare.
**Cost to add**: small-to-moderate — one new dependency, one branch in
`bank-reference-ocr.ts`'s mime-type gate.

## 4. Confidence Score Surfaced to the Admin
**What**: show the admin how confident the OCR extraction was (e.g. "low
confidence — please verify") rather than presenting every pre-fill identically.
**Trigger**: admins report acting on OCR output that turned out wrong often
enough that a confidence signal would change their behavior.
**Why not now**: `tesseract.js` does expose per-word confidence, but nothing in
the current design reads or surfaces it — adding UI for a signal nobody has
asked for yet is premature.
**Cost to add**: small — the data is already available from the OCR engine;
this is a UI-only addition.

## 5. Multi-Language OCR
**What**: recognize UPI app screenshots in a resident's local language, not just
English.
**Trigger**: a real submission where the screenshot's app-native language isn't
English and OCR extraction fails as a result.
**Why not now**: `tesseract.js` supports additional language packs, but none are
wired in v1 — not requested, and adds worker-init cost for languages that may
never be used.
**Cost to add**: small — `createWorker` already takes a language parameter;
this is a configuration change plus bundling the relevant trained-data files.

## 6. Bulk-Reference CSV Export
**What**: an admin-facing export of every approved Deposit's `bankReference`
alongside amount/date/flat, formatted for handing directly to an external
auditor or accountant.
**Trigger**: an actual audit engagement where Receipt Book's on-screen
search/columns prove insufficient and a file handoff is genuinely needed.
**Why not now**: Receipt Book's extended search (R9) already covers the
day-to-day "find a specific transaction" need; a bulk export is a different,
audit-season-specific workflow with no confirmed demand yet.
**Cost to add**: small — a CSV-serialization endpoint over data Receipt Book
already queries.

## Guiding Rule for All of the Above
Don't build any item in this document until the specific trigger listed next to
it has actually happened. If a trigger does occur, re-confirm the exact shape
with the user before implementing — item 1 in particular interacts with a
core trust-boundary decision (`bankReferenceSource` is always server-computed,
never client-declared) made deliberately in this feature's v1, and shouldn't be
assumed to still hold its original shape without a fresh check.
