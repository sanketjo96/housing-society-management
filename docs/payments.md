# Payments — Phase 6 (QR Payment & Proof Verification)

Reference for the selection-based payment flow: UPI QR generation, proof upload, admin
review, and the manual mark-as-paid fallback. Same route/prefix convention as
`docs/auth.md` — every path below is mounted under `/api/`.

## Storage adapter — `src/lib/storage/`

Proof files (screenshots, PDFs) need somewhere to live, and where that "somewhere" is
was explicitly left open — local disk today, potentially S3 or Google Drive later, with
no rewrite required to switch. `StorageAdapter` (`types.ts`) is the contract every
backend implements:

```ts
export interface StorageAdapter {
  save(input: SaveFileInput): Promise<{ key: string }>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
```

**Deliberately narrow**: every method deals in raw bytes only. No adapter tracks
mimeType, original filenames, or anything else — that metadata lives in the
`PaymentProof` row (`fileUrl` = the adapter's opaque `key`; `mimeType` = the one source
of truth for `Content-Type` when serving the file back, regardless of backend). `key` is
opaque to every caller — a relative disk path for `LocalStorageAdapter`, an S3 object
key or a Drive file id for a future adapter — nobody but the adapter that produced it
ever parses or constructs one.

**`LocalStorageAdapter`** (`local-storage-adapter.ts`) is the only implementation right
now, matching this MVP's actual deployment target (self-hosted VPS, `CLAUDE.md`'s
non-functional requirements — no third-party account, credentials, or network
dependency needed). Writes under a base directory (`LOCAL_STORAGE_DIR`, default
`./uploads`); in Docker this is a named volume (`docker-compose.yml`'s `uploads_data`)
so files survive container restarts/redeploys. `resolveSafe()` refuses to resolve any
key that would land outside the base directory — keys are always adapter-generated
internally, never taken from user input, but it's a cheap guarantee worth having for a
function that touches the filesystem directly.

**`getStorageAdapter()`** (`index.ts`) is the one place anything else in the codebase
should import from — never a concrete adapter class directly. Picks the implementation
from `STORAGE_PROVIDER` (`local` if unset). `s3`/`gdrive` are named as recognized
extension points that throw a clear "not implemented yet, add a case here" error rather
than silently falling through to `local` or crashing with an unrelated error — **adding
a new backend is: implement `StorageAdapter`, add one `case` here, nothing else in the
codebase changes.** No S3/Drive SDK is installed; wiring one in is intentionally left
for whenever there's a real need for off-box storage, not built speculatively now.

## UPI link + QR — `src/lib/upi.ts`

`buildUpiDeepLink({ vpa, payeeName, amount, note })` — pure function, the standard
`upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...` deep link any UPI app recognizes.
`generateQrDataUrl(link)` wraps the `qrcode` npm package (local generation, no external
API, per `CLAUDE.md`'s tech-stack table) and returns a base64 PNG data URL the frontend
drops straight into an `<img src>` — no separate image-hosting endpoint needed.

## Resident QR generation — `POST /api/me/maintenance-records/qr`

Task 6.1. `OWNER`/`TENANT` only. **Request**: `{ maintenanceRecordIds: string[] }`.
**Response**: `{ amount: number, upiLink: string, qrDataUrl: string }`. Every selected
record must belong to the caller (`payerId`) and currently be `UNPAID` — `404` if any
id doesn't resolve to the caller's own record, `409` (with the offending
`recordIds`) if any selected record isn't `UNPAID`.

**Stateless — no DB write happens here.** The actual "these records are now mid-payment"
transition happens at proof upload (below), matching the flow: select a subset, see a
QR, pay externally via any UPI app, *then* upload proof. Regenerating the QR for the
same selection (e.g. the resident navigates away and back) is always safe.

## Resident proof upload — `POST /api/me/payment-proofs`

Task 6.2. `OWNER`/`TENANT` only, `multipart/form-data`: a `file` field (image/PDF,
validated server-side — see below) plus a `maintenanceRecordIds` field carrying a
JSON-encoded array string (multipart has no native array field type). Same
own-records-must-be-UNPAID validation as QR generation.

**One transaction, rule 7's cascade**: creates one `PaymentProof` (`status: PENDING`)
connected to every selected `MaintenanceRecord` (many-to-many), flips every one of
those records to `PENDING_REVIEW` together, and writes one `AuditLog` row
(`action: 'SUBMIT_PAYMENT_PROOF'`). The storage write happens **before** the transaction
starts — external I/O (disk/S3/Drive) has no place inside a Postgres transaction, since
holding the transaction open across a slow write helps nothing. A file that saves but
never gets linked to a DB row (e.g. the transaction fails after) is a harmless orphan;
the reverse — a DB row referencing a file that failed to save — would not be.

**Server-side file validation** (`src/middleware/proof-upload.ts`, cross-cutting
requirement): `multer` with `memoryStorage()` (never `diskStorage` — the buffer goes
straight to whichever `StorageAdapter` is active, which may not even be local disk),
`fileFilter` allowlisting `image/jpeg`/`image/png`/`image/webp`/`application/pdf`, and a
5MB `limits.fileSize`. Both violations reach a new global error-handling middleware
(`src/middleware/error-handler.ts`, mounted last in `app.ts`) and come back as a clean
`400` JSON body — see that file's comment for why a catch-all was worth adding here
specifically (multer's errors arrive via Express's synchronous `next(err)`, unlike this
codebase's usual per-controller `try/catch` convention for async errors).

## Authenticated file access — `GET /api/payment-proofs/:id/file`

Task 6.3. `ADMIN`/`OWNER`/`TENANT`, but never public (cross-cutting requirement:
"Secure, authenticated-only proof file access"). `404` if the proof doesn't exist or
belongs to a different society; `403` if it exists, is in the caller's own society, but
the caller is neither an admin nor the uploader — a deliberately distinct case from
`404` (leaking "this id exists" isn't the same risk as leaking someone else's proof
image). Streams the file straight through (`Content-Type` from `PaymentProof.mimeType`,
the DB row — never re-derived from the adapter) rather than returning a redirect or
presigned URL, so the contract stays identical across every possible storage backend:
local disk has no other way to serve bytes, and this keeps S3/Drive adapters from
needing special-cased frontend handling later.

## Admin review queue — `GET /api/admin/payment-proofs`

Task 6.4. Admin-only. Optional `?status=PENDING|APPROVED|REJECTED` filter. Each proof
includes `uploadedBy` (id/name/email) and `maintenanceRecords` (each with its `flat`
summary) — an admin needs to know who to follow up with and which flat/period(s), not
just that a proof exists.

## Approve — `POST /api/admin/payment-proofs/:id/approve`

Task 6.5. Admin-only. `404` if not found/wrong society, `409`
(`ProofAlreadyReviewedError`) if the proof isn't currently `PENDING`. One transaction:
proof → `APPROVED` (`reviewedById`/`reviewedAt` set), every linked record → `PAID`,
one `AuditLog` row (`action: 'APPROVE_PROOF'`).

## Reject — `POST /api/admin/payment-proofs/:id/reject`

Task 6.6. Admin-only. **Request**: `{ reason?: string }` → stored as `adminNote`. Same
`404`/`409` cases as approve. One transaction: proof → `REJECTED`, every linked record
reverts to `UNPAID` (so the resident can re-select and re-upload), one `AuditLog` row
(`action: 'REJECT_PROOF'`).

**Not yet wired to an actual notification** — CLAUDE.md's rule 7 says the resident is
notified with the optional reason, but that's `EmailProvider` (Phase 7), not built yet.
Phase 7 is expected to hang a real send off `REJECT_PROOF`'s (and `APPROVE_PROOF`'s)
audit trail, not invent a new trigger point.

## Manual mark-as-paid fallback — `POST /api/admin/maintenance-records/mark-paid`

Task 6.7. Admin-only, for cash/bank-transfer edge cases — no proof involved. **Request**:
`{ maintenanceRecordIds: string[] }`. Same "every id must exist and currently be
`UNPAID`" validation as the resident-facing endpoints (`404`/`409`). Marks every given
record `PAID` directly. **Logged as `MANUAL_MARK_PAID`, one `AuditLog` row per record**
— deliberately distinct from `APPROVE_PROOF` in the trail (rule 7's explicit
requirement: "logged distinctly... separate from QR-flow approvals"), and per-record
rather than one combined entry, since there's no single parent entity (unlike a
`PaymentProof`) to hang one row off of.

## Frontend — resident payment flow (`client/src/pages/MaintenancePage.tsx`)

Task 6.8. Every `UNPAID` row in the Passbook table gets a checkbox (`PENDING_REVIEW`/
`PAID` rows don't — nothing to select). Selecting one or more shows a "N selected · ₹X"
bar with a "Pay selected" button. Clicking it swaps to a `PaymentPanel`: fetches the QR
(`react-query`, keyed on the exact selection so re-selecting a different set
regenerates it), shows the amount + QR image + a "Open in a UPI app" link (the raw
`upi://` deep link — works when opened on a phone with a UPI app installed; the QR image
is the primary path, meant to be scanned), then a file picker + "Submit proof" button.
On successful upload, invalidates `['my-maintenance-records']` and returns to the
passbook — the just-submitted records now show "Pending review".

**A necessary fix surfaced building this**: `client/src/lib/api.ts`'s `apiFetch` was
unconditionally setting `Content-Type: application/json` on every request, which
silently breaks a `FormData` body (the browser needs to set its own
`multipart/form-data; boundary=...` header, only when `Content-Type` is left
completely unset). Fixed by skipping the default when `init.body instanceof FormData` —
every other caller is unaffected.

## Frontend — admin review queue (`client/src/pages/admin/PaymentProofsPage.tsx`)

Task 6.9. New "Payment proofs" tab on `/dashboard`, admin-only, alongside "Flats and
residents" and "Settings". Table of pending proofs (flat, period(s), uploader, amount),
"View proof" (fetches the file through `authedFetch` — the endpoint is authenticated,
so a plain `<a href>` can't carry the Bearer token — then opens it via a `blob:` object
URL in a new tab; works for both images and PDFs, the browser's own viewer handles
either), "Approve", and "Reject" (reveals an inline optional-reason field before
confirming, rather than a native `window.prompt`, matching this app's established
pattern of inline expansion over browser dialogs).

## Manually verified against the real running stack

```sh
# QR generation for one of the seeded outstanding (2026-07) records
curl -X POST http://localhost/api/me/maintenance-records/qr \
  -H "Content-Type: application/json" -H "Authorization: Bearer <aliceToken>" \
  -d '{"maintenanceRecordIds":["<recordId>"]}'
# → 200, { amount: 1500, upiLink: "upi://pay?...", qrDataUrl: "data:image/png;base64,..." }

# Proof upload (multipart)
curl -X POST http://localhost/api/me/payment-proofs \
  -H "Authorization: Bearer <aliceToken>" \
  -F "maintenanceRecordIds=[\"<recordId>\"]" \
  -F "file=@/tmp/proof.jpg;type=image/jpeg"
# → 201, { id, status: "PENDING", ... }; the record's status is now PENDING_REVIEW

# Admin approves
curl -X POST http://localhost/api/admin/payment-proofs/<proofId>/approve \
  -H "Authorization: Bearer <adminToken>"
# → 200, { status: "APPROVED", ... }; the record's status is now PAID
```

Cleaned up afterward — this touched real seeded data (Alice's actual July 2026 record),
so the test proof/record state was reverted rather than left approved.
