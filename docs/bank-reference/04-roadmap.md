# Bank Reference Capture — Roadmap

Principle: build bottom-up — schema and the OCR module first, since nothing else
compiles without them, then the resident submission path, then the admin
surfaces that read what submission produces. Unlike `docs/other-charges/`, there
is no cross-pool balance integration to sequence around; this is a simpler,
single-track dependency chain.

## Suggested Build Order

```
1. Schema (Epic 1)
   BankReferenceSource enum, bankReference/bankReferenceSource columns, migration
   ── nothing downstream compiles without this

2. OCR Engine (Epic 2)
   tesseract-ocr-engine.ts, bank-reference-extractor.ts, bank-reference-ocr.ts
   ── independent of the schema; can build in parallel with Epic 1, but both
      must land before Epic 3

3. Backend — Resident Submission (Epic 3)
   ocr-extract endpoint, submitPaymentIntent/createDeposit diffing logic
   ── the core capture mechanism; nothing in the Pay UI can be wired without it

4. Backend — Admin Paths (Epic 4)
   manualDeposit param, Receipt Book select — independent of Epic 3, can run
   in parallel with it
   ── small and isolated; no reason to sequence after Epic 3

5. Frontend — Resident Pay Flow (Epic 5)
   PayIntentPanel's OCR pre-fill + editable field, Passbook display
   ── depends on Epic 3 existing

6. Frontend — Admin Surfaces (Epic 6)
   ReceiptApprovalModal screenshot+reference pane, PaymentProofsPage
   columns/form, Receipt Book column+search
   ── depends on Epics 3 and 4; benefits from Epic 5 existing first, since you
      need a real submitted reference on hand to actually approve against

7. Tests (Epic 7)
   Written alongside each epic in practice — listed last only as the final gate
```

No pre-launch external-dependency blocker (unlike Other Charges' WhatsApp
template approval) — `tesseract.js` is a local npm dependency with no
third-party approval or registration step, so there is nothing to submit ahead
of time.

## Explicit Non-Goals of This Roadmap
- Do not build real bank-statement matching "while we're in the area" — it's
  explicitly future-scope, a separate integration-heavy feature.
- Do not build the `SocietyLedgerEntry`/`SocietyTransaction` model here —
  unrelated, larger, separate feature; see `05-future-scope.md`.
- Do not add PDF-proof OCR (a rasterization dependency) unless a real need is
  demonstrated.
- Do not let the client declare `bankReferenceSource` — the server-recompute-
  and-diff design is a deliberate trust boundary, not a placeholder for a
  "just trust the client" simplification later.
