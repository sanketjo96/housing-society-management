# Bank Reference Capture — Scope & Task Breakdown

## In Scope
OCR-assisted capture of a bank/UPI transaction reference on Deposit submission,
server-computed provenance tracking, read-only display in the existing
approval modal, direct admin entry for `manualDeposit`, and surfacing the
reference on Receipt Book and the resident's own Passbook — per
[`01-requirements.md`](./01-requirements.md) and
[`02-architecture.md`](./02-architecture.md).

## Out of Scope
Real bank-statement/open-banking matching, a `SocietyLedgerEntry`/
`SocietyTransaction` model for society-initiated income/expense, PDF-proof OCR,
a dedicated auditor-export UI — see [`05-future-scope.md`](./05-future-scope.md).

---

## Task Breakdown

### Epic 1: Schema
| Task | Description | Effort |
|---|---|---|
| 1.1 | `BankReferenceSource` enum + `LedgerEntry.bankReference`/`bankReferenceSource` columns | 15 min |
| 1.2 | Migration (`add_ledger_entry_bank_reference`) — verify existing rows backfill to `NULL` cleanly | 15 min |

**Epic 1 total: ~30 min**

### Epic 2: OCR Engine & Extraction
| Task | Description | Effort |
|---|---|---|
| 2.1 | Add `tesseract.js` dependency; `infrastructure/ocr/tesseract-ocr-engine.ts` (`recognizeText`) | 30 min |
| 2.2 | `shared/billing/bank-reference-extractor.ts` — regex heuristics (GPay/PhonePe/Paytm/bare-UTR) | 45 min |
| 2.3 | `infrastructure/ocr/bank-reference-ocr.ts` — orchestration + mime-type gate | 20 min |

**Epic 2 total: ~1.5 hours**

### Epic 3: Backend — Resident Submission Flow
| Task | Description | Effort |
|---|---|---|
| 3.1 | New `POST /api/me/ledger/deposits/ocr-extract` (service + controller + route + Zod), reusing `proofUpload`/`verifyFileSignature` | 45 min |
| 3.2 | `submitPaymentIntent`: accept `bankReferenceInput`, server-recompute OCR, diff-and-set `bankReference`/`bankReferenceSource` | 1 hour |
| 3.3 | `createDeposit`: same treatment, `CreateDepositInput.bankReferenceInput` | 30 min |
| 3.4 | `resident-ledger-schemas.ts` — Zod for the new field on the intent-submit body | 15 min |

**Epic 3 total: ~2.5 hours**

### Epic 4: Backend — Admin Paths
| Task | Description | Effort |
|---|---|---|
| 4.1 | `manualDeposit` gains `bankReference` param; `manualDepositSchema` Zod field | 30 min |
| 4.2 | `admin-receipts-service.ts`'s `listReceipts` select gains `bankReference` | 10 min |

**Epic 4 total: ~40 min**

### Epic 5: Frontend — Resident Pay Flow
| Task | Description | Effort |
|---|---|---|
| 5.1 | `PayIntentPanel.tsx` — OCR-extract call on file select, editable reference field, wired into submit | 1.5 hours |
| 5.2 | `ResidentDashboardOverview.tsx` — `LedgerRow.bankReference` display on Deposit rows | 30 min |

**Epic 5 total: ~2 hours**

### Epic 6: Frontend — Admin Surfaces
| Task | Description | Effort |
|---|---|---|
| 6.1 | `ReceiptApprovalModal.tsx` — proof-screenshot pane + read-only reference display | 1.5 hours |
| 6.2 | `PaymentProofsPage.tsx` — Reference column; `MarkAsPaidModal` gains the reference input | 45 min |
| 6.3 | `ReceiptBookPage.tsx` — Bank reference column + extend search filter | 30 min |

**Epic 6 total: ~2.75 hours**

### Epic 7: Documentation & Tests
| Task | Description | Effort |
|---|---|---|
| 7.1 | This `docs/bank-reference/` folder (already complete) | — |
| 7.2 | Backend tests: `bank-reference-extractor.test.ts` (pure regex cases per app), `resident-ledger.test.ts` additions (OCR-extract endpoint, submit-with-reference diffing), `admin-ledger.test.ts` (`manualDeposit` reference) | 2.5 hours |
| 7.3 | Frontend tests: `PayIntentPanel.test.tsx`, `PaymentProofsPage.test.tsx`, `ReceiptBookPage.test.tsx` updates | 1.5 hours |

**Epic 7 total: ~4 hours (excluding already-complete docs)**

---

## Total Effort Estimate
- Epic 1 (Schema): ~30 min
- Epic 2 (OCR Engine): ~1.5 hours
- Epic 3 (Backend — Resident Flow): ~2.5 hours
- Epic 4 (Backend — Admin Paths): ~40 min
- Epic 5 (Frontend — Resident): ~2 hours
- Epic 6 (Frontend — Admin): ~2.75 hours
- Epic 7 (Tests): ~4 hours
- **Total: ~14 hours.** Epics 1–2 must land before Epic 3 (nothing downstream
  compiles without the schema or the OCR module); Epic 3 must land before Epics
  5–6 (the frontend needs the endpoints to call); Epic 4 is independent and can
  run in parallel with Epic 3.

## Acceptance Criteria (per epic)
- **Epic 1 done when**: migration applies cleanly; every pre-existing
  `LedgerEntry` row backfills `bankReference`/`bankReferenceSource` to `NULL`
  with zero behavior change.
- **Epic 2 done when**: `extractBankReference` correctly parses representative
  sample text for GPay, PhonePe, and Paytm confirmation screens, and returns
  `null` (never throws) for unrecognized or empty input.
- **Epic 3 done when**: uploading a screenshot to `ocr-extract` returns a
  pre-fill without writing anything to the database; submitting an intent with a
  matching vs. edited reference correctly sets `OCR_EXTRACTED` vs. `MANUAL_ENTRY`
  server-side, never trusting a client-sent source value.
- **Epic 4 done when**: an admin can record a `manualDeposit` with a typed bank
  reference, and it appears correctly on the resulting `LedgerEntry`/Receipt
  Book row.
- **Epic 5/6 done when**: the Pay flow shows a pre-filled, editable reference
  field that never blocks submission on OCR failure; the approval modal shows
  the reference read-only next to the proof screenshot with no re-typing;
  Receipt Book's new column and search correctly surface it.
- **Epic 7 done when**: `npm run build`, `npm run lint`, and `npm test` are
  clean in both `server/` and `client/`.
