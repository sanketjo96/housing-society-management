# Receipts — generation & approval workflow (2026-08-11)

Confirmed against a plain-text requirements doc covering five areas: the approval
flow itself, receipt content, admin-configurable template settings, signature
upload, and a rate-calculation rule guarding against recomputing a receipt's amount
from current billing settings. Layered on top of Phase 6's ledger approve/reject
(`docs/payments.md`) and Phase 8's admin dashboard (`docs/admin-dashboard.md`) —
neither the Pay flow, the balance formula, nor settlement status changed; only what
happens *at the moment of approval* did. See `CLAUDE.md`'s "Addition (2026-08-11):
Receipt generation and approval workflow" for the confirmed decisions and the two
judgment calls resolved during implementation (both covered below too).

## Addendum (2026-08-17): signed by Chairman & Secretary, not a single treasurer

The signatory block described below (originally: one free-text name/title pair,
plus one uploaded signature image, all admin-configurable via `receiptSignatoryName`/
`receiptSignatoryTitle`/`receiptSignatureFileKey`) is **replaced** with two fixed
signatory blocks — **Chairman** and **Secretary** — rendered side by side at the
bottom of every receipt. This follows directly from the same-day "Add committee
signature management" work (`CLAUDE.md`'s Committee-roles addenda): the society now
has real `Society.chairman`/`secretary` User relations with their own uploaded
signature images (`chairmanSignatureFileKey`/`secretarySignatureFileKey`), so a
receipt can show the *actual* office-holders instead of a free-text name an admin had
to keep in sync by hand.

- `receipt-pdf.ts`'s `ReceiptData` drops `signatoryName`/`signatoryTitle` in favor of
  `chairmanName?`/`secretaryName?`; `renderReceiptPdf`'s second parameter becomes
  `ReceiptSignatures` (`{ chairman?: Buffer; secretary?: Buffer }`) instead of a single
  `Buffer`. Either role may be unassigned — that block just falls back to the
  blank-line rendering, same fallback behavior as before, per role.
- `receipt.service.ts`'s `buildReceiptData` reads `society.chairman?.name` /
  `society.secretary?.name` (the committee relation, not a free-text column);
  `getSignatureBufferOrUndefined` now takes a raw file key so the same function
  serves both roles, fetched together via the new `getCommitteeSignatures` helper.
- The treasurer's signature (`receiptSignatureFileKey`, still managed from the
  Committee tab) is no longer read for receipt rendering at all — it remains only as
  a Committee-tab record of the treasurer's own signature image, unrelated to
  receipts going forward.
- `receiptSignatoryName`/`receiptSignatoryTitle` (the old free-text fields) were
  dropped entirely — `Society` schema columns, migration
  (`20260817172205_drop_unused_receipt_signatory_fields`), the `updateSettingsSchema`
  Zod fields, `society-settings.service.ts`'s `SocietySettings`/
  `UpdateSocietySettingsInput`, and the client's `SocietySettings` type — rather than
  left in place unused. One live society had real (now-stale) data in these columns;
  dropping it was confirmed explicitly before running the migration. The Receipt
  template admin page (`ReceiptTemplatePage.tsx`) dropped the "Signatory
  name"/"Signatory title" inputs, replacing that section's copy with a pointer to the
  Committee tab (same pattern the old "Treasurer signature" pointer already used,
  just naming both roles now).
- Everything else in this doc — approval flow, receipt number determinism, purpose
  text, the rate-calculation rule, `manualDeposit`'s receipt issuance, and the legacy
  no-backfill 404 — is unchanged.

## Approval flow

Clicking **Approve** on a pending Deposit or Credit no longer settles it directly.
It opens a receipt-preview modal (`client/src/components/ReceiptApprovalModal.tsx`)
that streams the **exact PDF that will be issued** — not a separate hand-built
preview template, which would eventually drift from the real one. **Cancel** closes
the modal with no action taken; the entry stays `PENDING`. **Confirm and approve**
is the actual approval action, calling the unchanged `POST
/api/admin/ledger-entries/:id/approve` — this is the point the entry settles *and*
the receipt is considered issued (a `Receipt` row is created, its PDF saved).
**Reject stays a single-click action, no modal** — there's no receipt to validate
when declining.

The preview is possible with zero risk of disagreeing with the real thing because
both paths call the exact same `buildReceiptData`/`renderReceiptPdf` functions
(`receipt.service.ts`, `lib/receipt-pdf.ts`) — the preview just never calls
`storage.save()` or writes to the database.

## Receipt number — deterministic, computed before approval

```
receiptNumber = `${society.receiptNumberPrefix}-${flat.wing}${flat.flatNumber}-${ledgerEntryId}`
```

`buildReceiptNumber` (`receipt.service.ts`) is a pure function. Because a
`LedgerEntry`'s `id` already exists the moment it's created (well before
approval), the receipt number is fully computable in advance — there is no shared
counter or sequence to race on, and the number shown in the pre-approval preview
is *guaranteed* to equal the number actually persisted on approval (this is
asserted directly in `tests/services/receipt.service.test.ts`'s "preview and the
eventually-issued receipt number match exactly" test).

## Receipt content

Society name and address, the receipt number, the resident's name and flat
(`wing-flatNumber`), the date, transaction type (Deposit/Credit), a purpose line,
the amount shown **both numerically and in words** (`lib/number-to-words.ts`'s
`toIndianCurrencyWords` — Indian numbering: crore/lakh/thousand, plus paise when
the amount isn't a whole rupee), and a signatory block (name, title, and the
uploaded signature image if one exists, else a blank line).

**Purpose text is a generic label per type, not an itemized per-month
breakdown** (confirmed scope decision, made explicitly before implementing): a
Deposit's purpose is always `"Maintenance dues payment"`; a Credit's purpose is
its own existing required `note` field (the reason a resident already has to
supply when requesting a Credit — see `docs/payments.md`). This matches the
ledger model directly: a Deposit is never tied to specific `MaintenanceRecord`s
under the 2026-08-06 pivot, so there's nothing itemizable to list.

## Template customization — `GET`/`PATCH /api/admin/settings`

`Society` gained new columns, editable via the existing settings endpoints
(`docs/maintenance-records.md`'s "Admin settings" section covers the
pre-existing `tenantRateFactor`/`defaultBaseRate` pair; these are additive):

| Field | Notes |
|---|---|
| `receiptNumberPrefix` | Defaults to `"RCPT"`. Validated `^[A-Za-z0-9-]{1,20}$` — it's concatenated directly into every receipt number, so free-form text has no business there. |
| `receiptFooterNote` | Optional. |
| `address` | Already existed on the schema (society onboarding), just never exposed via `GET`/`PATCH /api/admin/settings` until now — needed here since it's printed on every receipt's letterhead. |

(`receiptSignatoryName`/`receiptSignatoryTitle` originally listed here were dropped
entirely on 2026-08-17 — see the addendum above — once the signatory block moved to
the Chairman/Secretary committee data instead of free text.)

`receiptFooterNote` accepts an empty string on `PATCH` specifically to mean "clear
this back to `null`" — `updateSocietySettings` treats an empty string as `null`,
distinct from omitting the key entirely (which leaves the field untouched, ordinary
PATCH semantics). `receiptNumberPrefix` cannot be cleared this way (schema-level
default keeps it always non-empty).

**Changes take effect for future receipts only.** A `Receipt`'s PDF is rendered
and saved once, at approval time — it is never re-rendered on a later read. There
is nothing to "update" about an already-issued receipt even if every Settings
field changes the next day.

## Signature upload

`POST`/`DELETE`/`GET /api/admin/settings/signature`, admin-only. Upload accepts
PNG/JPEG/WEBP only (not PDF — a signature is embedded as a picture, so allowing a
document format the way `proofUpload` does makes no sense here), 2MB cap (tighter
than the 5MB proof-upload default; a signature is a small graphic). Once uploaded,
it displays above the signatory name on every future receipt, replacing the blank
signature line (`lib/receipt-pdf.ts`'s `renderReceiptPdf`). Removing it reverts to
the blank line. Optional throughout — a receipt renders fine with no signature.

**Replace/remove ordering**: save the new file → point `Society` at it → only
*then* delete the old file (never delete-then-save). A failure between the first
two steps leaves the *old* signature in effect a bit longer, which is harmless;
the alternative ordering could leave Settings referencing a file that no longer
exists. Same principle, mirrored in `society-settings.service.ts`'s
`setReceiptSignature`/`removeReceiptSignature` and covered directly by
`tests/services/society-settings.service.test.ts`'s "replacing a signature saves
the new file before deleting the old one" test.

**If the stored signature file can't be read at render time** (deleted from disk
out-of-band, adapter misconfigured, etc.), `receipt.service.ts`'s
`getSignatureBufferOrUndefined` catches the failure, logs a warning, and falls
back to the blank-line rendering — a financial transaction settling is never
blocked by a broken decorative image.

## Rate calculation rule — read the stored amount, never recompute

A receipt's amount always comes from `LedgerEntry.amount` (or, for context, a
`MaintenanceRecord`'s own `amount`) exactly as it was **stored at creation time**
— never recalculated from the society's *current* `tenantRateFactor`/`baseRate`
at approval or receipt-generation time. This rule needed **zero new code**: both
`LedgerEntry.amount` and `MaintenanceRecord.amount` were already persisted once at
creation and never mutated afterward (confirmed by reading every call site in
`ledger.service.ts`/`maintenance-record.service.ts` before implementing) — so
`buildReceiptData` (`receipt.service.ts`) reading `entry.amount` directly already
satisfies this rule. If a flat's base rate or the society's tenant multiplier
changes between when a charge was billed and when its payment is eventually
approved, the receipt reflects what was actually billed, not today's settings.

## Data handling — signature storage

The signature image is stored as a real file via the same `StorageAdapter`
interface every other upload in this app uses (`src/lib/storage`,
`docs/payments.md`'s "Storage adapter" section) — private, authenticated access
only, never a public path. `Society.receiptSignatureFileKey` stores only the
adapter's opaque key (same "opaque key, not a browsable URL" contract as
`LedgerEntry.fileUrl`), not the image bytes. `GET /api/admin/settings/signature`
is the only way to retrieve the bytes, and it requires an admin's Bearer token.

## Schema

```prisma
model Society {
  // ...existing fields unchanged...
  receiptNumberPrefix      String  @default("RCPT")
  receiptFooterNote        String?
  receiptSignatureFileKey  String?
  receiptSignatureMimeType String?
  receipts                 Receipt[]
}

model Receipt {
  id            String   @id @default(cuid())
  receiptNumber String   @unique
  fileKey       String
  issuedAt      DateTime @default(now())
  ledgerEntryId String      @unique
  ledgerEntry   LedgerEntry @relation(fields: [ledgerEntryId], references: [id])
  issuedById String
  issuedBy   User   @relation("ReceiptIssuer", fields: [issuedById], references: [id])
  societyId String
  society   Society @relation(fields: [societyId], references: [id])
}
```

`Receipt` is 1:1 with `LedgerEntry` and holds only what's needed to serve the
already-rendered PDF back later — `fileKey` (the `StorageAdapter` key), the
`receiptNumber`, `issuedAt`, and who issued it. No snapshot of the template
fields is stored separately; the PDF itself **is** the frozen snapshot.

## Endpoints

| Method & path | Access | Notes |
|---|---|---|
| `GET /api/admin/ledger-entries/:id/receipt-preview` | Admin only | Streams the unsaved preview PDF. `404` not found/wrong society, `409` if not `PENDING` (reuses `LedgerEntryAlreadyReviewedError`). No side effects. |
| `POST /api/admin/ledger-entries/:id/approve` | Admin only | Unchanged request/response shape — now also issues the receipt as described above. |
| `POST /api/admin/ledger-entries/manual-deposit` | Admin only | Unchanged — also issues a receipt (see "manualDeposit also issues a receipt" below). |
| `GET /api/ledger-entries/:id/receipt` | Admin or the entry's own payer | Shared with the resident Passbook (not under `/admin`) — same route family and auth shape as the existing `GET /api/ledger-entries/:id/file`. `404` if no `Receipt` row exists yet (still pending, or a legacy pre-2026-08-11 entry); `403` via `ForbiddenLedgerEntryAccessError` if the caller is neither an admin nor the payer. |
| `POST`/`DELETE`/`GET /api/admin/settings/signature` | Admin only | Upload/remove/preview the treasurer's signature image. |

## Two judgment calls made during implementation

**1. `manualDeposit` (the cash/bank-transfer fallback) also issues a receipt.**
The written spec only describes the Approve-button flow, but a treasurer taking
cash needs a receipt at least as much as — arguably more than — a UPI depositor
(there's no screenshot serving as informal proof). `manualDeposit` creates its
`LedgerEntry` already-`APPROVED`, bypassing the Approve button/preview-modal
entirely, so there's no `PENDING` state to preview against before committing —
it issues the receipt synchronously as part of its one existing step, no modal.
Implementation detail: since the entry doesn't exist yet at the point the
receipt number needs computing (it's derived from the entry's own id),
`manualDeposit` precomputes the id via `randomUUID()` (same helper already used
by `local-storage-adapter.ts`) and passes it through explicitly, preserving the
same "save the file, then commit the row" ordering used everywhere else.

**2. A legacy entry approved before 2026-08-11 has no `Receipt` row — this is
never backfilled.** `GET /api/ledger-entries/:id/receipt` returns a plain `404`
("No receipt was issued for this entry") for such rows rather than lazily
fabricating one under today's settings. A fabricated "receipt" for a transaction
that, per this feature's own "issued" semantics, never actually had one issued
at the time would be actively misleading — the correct message is that no
receipt exists, not a receipt with a fake issuance date.

## Frontend

**`client/src/pages/admin/PaymentProofsPage.tsx`**: gained a Pending/Approved/
Rejected status tab bar (the backend already supported `?status=` filtering —
only the UI needed the addition, since a receipt nobody can ever re-download
after the fact would defeat the point). Approve opens
`ReceiptApprovalModal.tsx` instead of firing the approve mutation directly.
Approved rows show a "Download receipt" action (blob-fetch + `window.open`,
same pattern the existing "View proof" button already used).

**`client/src/components/ReceiptApprovalModal.tsx`** (new): fetches the preview
PDF as an authenticated blob and renders it via `<object data={blobUrl}
type="application/pdf">` inside `Modal.tsx` (which gained an optional
`maxWidthClassName` prop so this modal can be wider than the app's original
small-form default). Cancel/Confirm as described above.

**`client/src/pages/admin/SettingsPage.tsx`**: gained a "Receipt template"
section on the existing form (address, prefix, signatory name/title, footer
note — all ordinary text fields saved via the existing `PATCH` submit) plus a
separate "Treasurer signature" widget with its own immediate-effect upload/
remove mutations (a file action doesn't belong inside a single-submit text
form — same reasoning as the pre-existing CSV-import panel on the Flats page).

**`client/src/pages/ResidentDashboardOverview.tsx`** (Passbook): each
Deposit/Credit row's `LedgerRow` gained an optional `hasReceipt` field; an
`APPROVED` row with `hasReceipt: true` shows a small "Receipt" download button
next to its status badge, hitting the same shared `GET
/api/ledger-entries/:id/receipt` endpoint the admin page uses. Residents
(owner or tenant, symmetric — whoever is the entry's `payerId`) can view/
download their own issued receipts; this was widened from an initial
admin-only scope during planning, matching the existing proof-file access
rule's symmetry.

## Manually verified against the real running stack

```sh
# Preview (PENDING entry) — streams a PDF, no side effects
curl http://localhost/api/admin/ledger-entries/<entryId>/receipt-preview \
  -H "Authorization: Bearer <adminToken>" -o preview.pdf
# → 200, Content-Type: application/pdf; no Receipt row created

# Approve — now also issues the receipt
curl -X POST http://localhost/api/admin/ledger-entries/<entryId>/approve \
  -H "Authorization: Bearer <adminToken>"
# → 200, { status: "APPROVED", ... }

# Download the issued receipt — same number as the preview above
curl http://localhost/api/ledger-entries/<entryId>/receipt \
  -H "Authorization: Bearer <ownerToken>" -o receipt.pdf
# → 200, Content-Type: application/pdf

# A legacy/never-approved entry has no receipt
curl http://localhost/api/ledger-entries/<pendingEntryId>/receipt \
  -H "Authorization: Bearer <ownerToken>"
# → 404, { "error": "No receipt was issued for this entry" }
```

Read-only/throwaway-data verification — no seeded demo data was left mutated.

## Addendum (2026-08-18): Receipt Book — admin register of every issued receipt

Confirmed gap: an admin who wanted to browse *all* issued receipts had to reuse
Payment Proofs' "Approved" tab, a pending-review queue repurposed for the job, not a
real register. Added a dedicated **Receipt Book** page — a read-only list of every
`Receipt` row ever issued for the society, searchable/filterable, each row
downloadable.

**`GET /api/admin/receipts`** (admin-only): returns every `Receipt` for the caller's
society, newest (`issuedAt desc`) first, each joined to its `LedgerEntry`'s
`type`/`amount`/`note`/`payer`/`flat`. No query params, no pagination — same
unbounded-`findMany`-then-filter-client-side convention as
`GET /api/admin/ledger-entries` (`listPendingLedgerEntries`), consistent with this
24-flat MVP's philosophy (`DataTable.tsx`'s own comment). Example response row:

```json
{
  "id": "cmsvyakfv000c01o6njeefp8x",
  "receiptNumber": "R-A2-cr3c93md",
  "issuedAt": "2026-08-16T15:19:26.926Z",
  "ledgerEntry": {
    "id": "cmsvy9oyb000a01o6cr3c93md",
    "type": "CREDIT",
    "amount": "500",
    "note": "wlwejnlqe",
    "payer": { "id": "...", "name": "Mr. Chaware", "email": "chaware@yahoo.com" },
    "flat": { "id": "...", "wing": "A", "flatNumber": "2" }
  }
}
```

(`fileKey`/`issuedById`/`societyId` are also present on each row — internal fields
the frontend ignores, not stripped, same shape Prisma returns.) Manually verified
against the real running stack (seeded society, 5 issued receipts): `GET
/api/admin/receipts` with a valid admin token returned all 5 rows in the shape
above; unauthenticated/malformed-token requests get `401` (`requireRole`'s existing
behavior, exercised directly rather than re-demonstrated here); a non-admin role
gets `403`, covered by the automated test suite below, not re-run manually.

**Backend location**: `server/src/features/receipts/admin/` (new `admin/` subfolder,
mirroring `flats/admin/` and `ledger/admin/`) — `admin-receipts-service.ts`
(`listReceipts`), `-controller.ts`, `-route.ts`, `-openapi.ts`. `receipt.service.ts`/
`receipt-pdf.ts` (issuance logic) are untouched; this is purely a new read query.
`ledger/admin/admin-ledger-service.ts`'s `LEDGER_ENTRY_LIST_INCLUDE` was exported (was
previously module-private) so `listReceipts` reuses the same payer/flat select shape
rather than redefining it.

**Frontend**: `client/src/pages/admin/ReceiptBookPage.tsx` (new), reachable from a new
"Receipt Book" sidebar item next to "Payment proofs" (`DashboardLayout.tsx`), routed at
`/receipt-book` (admin-only, `App.tsx`). Fetched once via React Query, then filtered
client-side by an issued-date range and a free-text search (matches receipt number,
flat, or resident name) — same pattern as `MaintenanceBookPage.tsx`'s date-range
filter. Two small helpers were extracted for reuse rather than copied a third time:
`components/LedgerTypeBadge.tsx` (the Deposit/Credit badge, previously private to
`PaymentProofsPage.tsx`) and `lib/download-file.ts`'s `downloadAuthedFile` (the
authenticated-blob-then-`window.open` idiom, previously duplicated locally in both
`PaymentProofsPage.tsx` and `ResidentDashboardOverview.tsx`) — both pages now import
from these shared locations instead of keeping their own copies.

Tests: `server/tests/features/receipts/admin/admin-receipts.test.ts` (admin-only
403, empty list, an approved deposit appears with the right shape after approval,
society isolation from another society's manually-recorded deposit).
