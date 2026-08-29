# Feature Status Tracker

Detailed build/scope/pending status per feature, cutting across `docs/` **by
feature**, not by phase. For a lightweight "what exists and where's its doc"
view, see [`_index.md`](./_index.md) instead — that's the entry point; this
file is for tracking what's still open. Complements
[`../task-status.md`](../task-status.md) (the phase-by-phase checklist).
Re-check against `git log` and each feature's own doc if this looks stale.

## Summary

| Feature | Docs | Status | Notes |
|---|---|---|---|
| Auth & Access Control | [`auth.md`](./auth.md) | ✅ Implemented | Phase 2, complete |
| Flat & Society Onboarding | [`flats.md`](./flats-and-residents.md) | ✅ Implemented | Phase 3, complete incl. 2026-08-06 resident self-service redesign |
| Maintenance Records | [`maintenance-records.md`](./maintenance-records.md) | ✅ Implemented | Phase 4, complete incl. arrears-billing fix |
| Payments — Ledger, QR, Bank Transfer | [`payments.md`](./payments.md) | ✅ Implemented | Phase 6, complete through the 2026-08-20 final Credit removal (Deposit cap on Outstanding lifted instead) |
| Admin Dashboard | [`admin-dashboard.md`](./admin-dashboard.md) | ✅ Implemented | Phase 8, complete incl. 2026-08-24 Outstanding card-group consolidation |
| Receipts — Generation & Approval | [`receipts.md`](./receipts.md) | ✅ Implemented | 2026-08-11 addition, complete incl. Chairman/Secretary signing + Receipt Book |
| Other Charges | [`other-charges/`](./other-charges/) | ✅ Implemented | 2026-08-19, updated 2026-08-21 (partial payment disallowed); 9 items explicitly deferred, see its own future-scope doc |
| Manage Finance | [`manage-finance/`](./manage-finance/) | ✅ Implemented | 2026-08-20; society-level income/expense ledger (`SocietyLedgerEntry`), fully separate from the resident-billing `LedgerEntry` — realizes the "Society-Level Income/Expense" idea below |
| Observability | [`observability/`](./observability/) | 🟡 Partially implemented | Stage 1 only (logging); 6 further stages deferred |
| Notifications — Email | `auth.md` (send mechanism) + `task-status.md` Phase 7 | 🟡 Partially implemented | Password-reset send confirmed live 2026-08-24 (`smi.techsanket.in` verified on Resend); the 3 per-event triggers now live in the shared pipeline below, not built separately here |
| Notifications — Event-Driven (WhatsApp + Email) | [`notifications/`](./notifications/) | 🟡 Email live, WhatsApp switched off | 3 events × 2 channels; Email fully working since 2026-08-24; WhatsApp disabled via `WHATSAPP_ENABLED=false` (its access token expired — needs a permanent System User token, then Meta template approval) |
| Security & Hardening Audit | [`security-audit.md`](./security-audit.md) | ✅ Implemented | Phase 9, one-time audit, 5 findings fixed |
| Bank Reference Capture | [`bank-reference/`](./bank-reference/) | 🟡 Phase 1 + partial Phase 2 | 2026-08-27; admin types `bankReference` at approval (mandatory); admin-side OCR "Infer from proof" added same day plus Receipt Book's bank-reference column — see the doc's status note |
| Society Onboarding — Bootstrap & Bulk Import | [`society-onboarding/`](./society-onboarding/) | ✅ Implemented | 2026-08-21; distinct from "Flat & Society Onboarding" above (per-flat, Phase 3) — this is platform-level: creating a brand-new `Society`+first `ADMIN`, plus bulk-importing a client's historical arrears/charges/finance data |
| Production Deployment | [`DEPLOY.md`](../../DEPLOY.md) | ✅ Implemented | 2026-08-21; HTTPS via a free dynamic-DNS hostname, not a purchased domain — see DEPLOY.md and `CLAUDE.md`'s "Addition (2026-08-21)" |
| Society-Level Income/Expense | [`manage-finance/`](./manage-finance/) | ✅ Implemented via Manage Finance | Was tracked here as an idea; built 2026-08-20 as Manage Finance (see above) — row kept for history |
| File Storage | [`file-storage.md`](./file-storage.md) | ✅ Implemented | 2026-08-26; local disk (default) or S3-compatible (Cloudflare R2), swappable via `STORAGE_PROVIDER`. Live deployment cut over to R2. Weekly DB backup job built and live 2026-08-27 (separate R2 bucket/credential) |
| Committee & Signatures | [`committee-and-signatures.md`](./committee-and-signatures.md) | ✅ Implemented | Chairman/Secretary/Treasurer roles + signature uploads; approving a Deposit now blocked (409) if neither Chairman nor Secretary has a signature configured (2026-08-26) |
| Vehicle Finder | [`vehicle-finder/`](./vehicle-finder/) | ✅ Implemented | 2026-08-28; resident vehicle registration + plate-number lookup (flat, occupant name, phone number on a match); manual search only — camera/OCR scan-assist was built and rolled back the same day, see the doc's Confirmed Product Decisions |
| Complaints | [`complaints/`](./complaints/) | 📝 Designed, not built | 2026-08-29; owner-only complaint logging + upvoting, admin-controlled status workflow; brings a previously out-of-scope item back in, see `docs/decisions/0007-complaints-back-in-scope.md` |

## Auth & Access Control
**Status**: ✅ Implemented (Phase 2, tasks 2.1–2.8, all complete).
**Scope implemented**: JWT access/refresh issuance, logout, password reset
(real email send via Resend since Phase 7), role-guard middleware, tenant-
scoping middleware, frontend login + protected routes.
**Pending**: none known.

## Flat & Society Onboarding
**Status**: ✅ Implemented (Phase 3, tasks 3.1–3.8, all complete).
**Scope implemented**: admin create/edit flat (inline owner/tenant contact
fields, find-or-create), id-based assign/remove tenant (lower-level
alternative), CSV bulk import, resident self-service ("My details" — own
profile + own flat's tenant management via `PUT /api/me/flat`).
**Pending**: none known.

## Maintenance Records
**Status**: ✅ Implemented (Phase 4, tasks 4.1–4.7, all complete).
**Scope implemented**: majority-of-days rate calculation with tiebreak, idempotent
monthly generation (manual trigger + cron), arrears billing (2026-08-06 fix —
generates for the *previous*, fully-elapsed month), admin Settings tab for
`tenantRateFactor`/`defaultBaseRate`, resident/admin record views, seed backfill
for demo data.
**Pending**: none known.

## Payments — Ledger, QR, Bank Transfer
**Status**: ✅ Implemented (Phase 6, through multiple confirmed pivots — see
`payments.md`'s own pivot notes for the full history: record-selection →
balance-based ledger → Credit removed → Credit re-introduced (allocation-based)
→ per-record settlement status derived via FIFO → UPI/bank-transfer fallback →
Credit removed a third and final time, 2026-08-20).
**Scope implemented**: payment-intent lock → QR (UPI) or bank details (fallback)
→ optional-proof Deposit submission (amount cap on Outstanding lifted 2026-08-20
— a resident may now pay beyond Outstanding, the excess becoming Available
Credit automatically, with no separate Credit request/review path anymore) →
admin approve/reject → manual mark-paid fallback → derived per-record settlement
status for Maintenance Book/escalation. The Pay control (amount/QR/bank-transfer
intent) moved from the Bills tab to the Payment History tab (2026-08-21),
directly above the deposit list it feeds. 2026-08-27: the Maintenance-pool
`PayIntentPanel` (shared with Other Charges, which is unaffected — no note
field or radios there at all, only the screenshot control) gained a
"Maintenance Payment" / "Expense to settle against maintenance" radio choice.
Revised same day: the optional reason note field is now always shown and
freely editable for a Maintenance payment regardless of which radio is
selected (originally it was gated behind "Expense to settle against
maintenance" only) — the radio choice now solely gates the committee-approval
warning ("Make sure you discuss this expense with the committee — the
committee can reject this payment."), shown only for "Expense to settle
against maintenance". Purely a client-side UI gate — the note
still rides the same `POST /api/me/ledger/deposits/intent/submit` `note`
field built earlier the same day; no new backend field or LedgerEntry status,
since rejection is already the existing admin reject path. Same day,
follow-up: both book pages' Payment History table gained a "Note" column
(`DepositNoteCell`, shared in `LedgerEntryDisplay.tsx`) — shows the resident's
own submitted `note` when present, and for a REJECTED row, the admin's
`adminNote` (rejection reason) instead/alongside, prefixed "Rejected: ".
`LedgerRow.adminNote` (`resident-ledger-service.ts`) is new — `note` already
existed on the type but was computed and returned, just never rendered
anywhere on the resident side.
**Pending**: no bank/UPI transaction reference captured on a Deposit — this is
exactly the gap `bank-reference/` (below) is designed to close, not yet built.

## Admin Dashboard
**Status**: ✅ Implemented (Phase 8, tasks 8.1–8.4, all complete, rewritten
against the ledger model).
**Scope implemented**: outstanding total + collection-rate widget (deposits-only
formula since the 2026-08-09 fix), flat-wise dues table, pending-proofs widget,
flagged-flats escalation widget (configurable grace period). Cards are grouped
into titled containers — Finance (income/expense/net, merged with the former
"Society Finance" group 2026-08-20; Maintenance Collection Rate card dropped
entirely the same day), Outstanding (Total Outstanding + the Maintenance and
Other Charges pools it's made of, consolidated into one container 2026-08-24;
the standalone Total Maintenance Credit card was dropped the same day), and
Society (owners/flats/tenants counts). "Mark as Paid" is its own page/route
(`createdByType=ADMIN` filter), delinked from Payment Proofs, which is now
reached only via its dashboard tile, not the sidebar (2026-08-20). The
flat-wise-dues drill-down (`/flat-dues`) lists every owner rather than only
those with a balance, with a Credit column and an explicit "Settled" indicator
when both Outstanding and Credit are zero (2026-08-24). A Year dropdown
(2026-08-27) scopes the Finance and Outstanding card groups to one calendar
year or "All" (lifetime, the default) — `GET /api/admin/dashboard/summary?year=`
filters `MaintenanceRecord`/`OtherCharge`/`LedgerEntry`/`SocietyLedgerEntry` by
year using the same `maintenanceRecordYearFilter`/`otherChargeYearFilter`/
`ledgerEntryYearFilter` helpers `computeFlatBalances` already had (exported from
`ledger-shared.ts`, previously dormant — no caller ever passed a year). The
Society card group (owners/flats/tenants counts) is a separate, always-unfiltered
query and is never affected by the year selector. The Resident Dashboard
(`ResidentDashboardOverview.tsx`) got the same Year dropdown the same day, via
`GET /api/me/balances?year=`. Also 2026-08-27: `getDashboardSummary`'s `societyTotalIncome` field itself
(not just the card) is now `societyLedgerTotals.totalIncome + totalPaid` —
recorded society income plus approved maintenance deposits, both already
year-scoped by the dropdown above — and `societyNetPosition` is
`societyTotalIncome − societyTotalExpense` using that same blended figure, so
Income and Net are internally consistent (superseding the same-day change
that only adjusted the Income *card* client-side, leaving Net on the old
pure-society-ledger figure). The Total Income card shows a small-font note
("Society income recorded + paid maintenance.") clarifying the composition.
`societyTotalExpense` is unaffected — resident billing never produces an
expense.
**Pending**: none known.

## Receipts — Generation & Approval
**Status**: ✅ Implemented (2026-08-11 addition, Phase 3-addendum-style task
outside the original numbering; all sub-items complete).
**Scope implemented**: approval-preview modal (byte-identical to the issued PDF),
deterministic receipt numbering, `manualDeposit` also issues a receipt, admin
Settings receipt-template fields + signature upload, Chairman/Secretary dual
signatory (2026-08-17), admin Receipt Book register (2026-08-18) with
dashboard-only, proof-filtered Payment Proofs tabs. An Other Charges receipt's
purpose line now names the real fee type(s) it settled (2026-08-24) —
`OtherCharge.settledByLedgerEntryId`, a single nullable FK stamped once at
approval time (correct as a single FK, not a join table, because an Other
Charges Deposit is always full settlement — one Deposit can cover many
charges, but a charge is never split across two), instead of the old generic
"Other charges payment" label. Receipt Book gained a searchable Fee Type
column reading the same link. Verified against the live deployment: a real
Other Charges receipt's actual PDF text reads "Towards Membership fee
payment."
**Pending**: none known — legacy pre-2026-08-11 entries have no receipt and are
deliberately never backfilled (a documented, permanent state, not a gap); a
legacy Other Charges receipt from before 2026-08-24 falls back to the
original generic purpose line for the same reason (no retroactive backfill).

## Other Charges
**Status**: ✅ Implemented (commit `d1af274`, 2026-08-19; partial-payment
behavior updated `fd84a3e`, 2026-08-21).
**Scope implemented**: admin-configurable Fee Types catalog, one-off billing to a
flat's owner, a fully separate Outstanding pool (own dashboard cards, own book
page, own Pay flow), reusing the existing approval queue/receipts/notifications.
Unlike Maintenance, an Other Charges payment can no longer be partial or exceed
the balance — the Pay amount is a read-only display of the full outstanding
total, not an editable field (2026-08-21; Maintenance is unaffected and still
allows partial payment/overpayment per payments.md rule 6). The Pay control also
moved from the Bills tab to the Payment History tab, same as Maintenance.
**Pending** (all explicitly deferred, see
[`other-charges/05-future-scope.md`](./other-charges/05-future-scope.md)):
bulk/multi-flat billing, tenant-as-payer, editing/voiding a charge, Other-Charges
Credit, escalation extended to this pool, per-charge due dates, CSV import,
default fee amounts, hard delete of a fee type. None have a confirmed trigger.

## Manage Finance
**Status**: ✅ Implemented (commit `39a87ac`, 2026-08-20).
**Scope implemented**: a new `SocietyLedgerEntry` model — deliberately separate
from the resident-centric `LedgerEntry` — tracking money the society itself
pays out (vendor bills, salaries) or receives from non-resident sources (bank
interest, common-area rental), with no flat/settlement math involved. Backed by
a `SocietyLedgerCategory` catalog (income/expense heads, direction-bound,
soft-delete via `isActive`), single-admin entry immutable once created (no
approval workflow, matching `OtherCharge`'s precedent), mandatory proof
attachment, `transactionDate` distinct from `createdAt`, `bankReference`
required unless payment method is Cash. Admin "Manage Finance" page (direction
toggle, category select filtered by direction) and "Finance categories" catalog
under Settings; admin dashboard's Finance card group (Total Income/Expense/Net)
computed independently of the resident-billing figures. Bulk historical import
via `POST /api/admin/society-ledger/import` (Society Onboarding's Phase E,
2026-08-21) reuses the same row-validator so the bulk and single-row paths
can't drift apart. 2026-08-27: the "Record a transaction" form gained an
"Infer from proof" button next to the bank/transaction reference field —
`POST /api/admin/society-ledger/ocr-extract` (admin-only, read-only) runs the
same self-hosted OCR + regex-extraction (`society-ledger-ocr-service.ts`,
reusing `infrastructure/ocr/tesseract-ocr-engine.ts` and
`shared/billing/bank-reference-extractor.ts` from `bank-reference/`) against
the freshly-selected file before the entry even exists, since there's nothing
stored yet to read back — distinct from the Deposit-approval infer endpoint,
which reads an already-uploaded file by entry id. Hidden entirely when payment
method is Cash (the reference field itself is inapplicable then); disabled
until a proof file is attached.
**Pending** (all explicitly deferred, see
[`manage-finance/05-future-scope.md`](./manage-finance/05-future-scope.md)):
two-person approval workflow, category rename (currently `isActive`-toggle
only), admin-configurable opening balance (so "Net" becomes a true running bank
balance instead of "recorded since tracking began"), CSV export,
recurring/scheduled expenses. None have a confirmed trigger.

## Observability
**Status**: 🟡 Partially implemented — Stage 1 only (commit `7c445aa`,
2026-08-19).
**Scope implemented**: structured logging via Pino, request logging, crash
capture.
**Pending** (see
[`observability/06-future-scope.md`](./observability/06-future-scope.md)):
request correlation across features, centralized log aggregation (Grafana
Loki), metrics (Prometheus + Grafana), distributed tracing (OpenTelemetry +
Tempo), dashboards & on-call alerting, multi-tenant observability. No stage has
a confirmed trigger yet.

## Notifications — Email
**Status**: 🟡 Partially implemented — but the real-send path is now actually
live for the pilot (2026-08-24), not just theoretically wired.
**Scope implemented**: `EmailProvider` interface (`console`/`resend`), wired
into password reset — every caller (Task 2.4's flow, 2026-08-06 self-service
tenant creation, admin flat onboarding) sends a real email automatically.
`EMAIL_PROVIDER=resend` was configured but, until 2026-08-24, was still on
Resend's sandbox sender — which only delivers to the Resend account owner's
own inbox, meaning real residents never actually received a password-reset
email despite the code path being "done." Fixed by verifying a dedicated
sending subdomain, `smi.techsanket.in` (a subdomain of the operator's own
`techsanket.in`, kept separate from the domain's existing SPF/DMARC used by an
unrelated portfolio site — subdomain SPF/DKIM/MX are independent per hostname,
so this can't collide) — DNS hosted at Hostinger, verified via a CNAME
(`send.smi.techsanket.in` → `send.forge.rmta.net`, Resend's newer combined
MX+SPF record) plus a DKIM TXT (`resend._domainkey.smi.techsanket.in`).
`EMAIL_FROM=notifications@smi.techsanket.in`. Confirmed working end-to-end —
a direct Resend API send returned 200 with a real message id, and the
recipient (an external Gmail address, not the Resend account owner) confirmed
actual receipt.
**Pending**: the *password-reset* send path above is separate from, and
unaffected by, the event-driven pipeline described in the next section — see
that section for the three business events (bill generated, deposit approved,
other-charge billed), which as of 2026-08-24 fire on email too, not just
WhatsApp. The original Phase 7 per-event *email* triggers (7.2–7.5) are
superseded by that shared pipeline rather than built as a separate email-only
path. The escalation job (7.6) specifically still has no automated
notification path at all on either channel — the Admin Dashboard's
flagged-flats widget only prepares a message for the admin to manually share,
by design (rule 8).

## Notifications — Event-Driven (WhatsApp + Email)
**Status**: 🟡 WhatsApp blocked on an external step; Email fully live
(commit `a99f40d` for WhatsApp, 2026-08-24 for the Email channel).
**Scope implemented**: full pipeline — `NotificationLog`-as-queue, a 1-minute
cron delivery sweep, idempotency (unique key, no duplicate sends per channel),
transient-vs-permanent failure handling — wired end-to-end for three events:
`MAINTENANCE_BILL_GENERATED`, `DEPOSIT_PAYMENT_APPROVED`,
`OTHER_CHARGE_BILLED`. (The originally-listed third event,
`CREDIT_PAYMENT_APPROVED`, no longer exists — it was replaced by
`OTHER_CHARGE_BILLED` when Credit was removed for good on 2026-08-20.) Each
event now fans out to **two channels** — WhatsApp (Meta Cloud API client,
verified against a mocked client) and Email (2026-08-24 addition, reusing the
already-verified `EmailProvider`/Resend path from the section above) — one
`NotificationLog` row per channel, each with its own idempotency key, so one
channel's retry/failure never blocks the other. No schema migration was
needed for Email: `NotificationChannel`'s `EMAIL` value has existed, unused,
since before `WHATSAPP` was even added. Business features (Billing/Ledger/
Maintenance) needed zero changes to gain the Email channel — they still only
ever call `notify(event)`. Full mechanism: `docs/features/notifications/architecture.md`'s
2026-08-24 note.
**Pending**: WhatsApp is currently switched off entirely via
`WHATSAPP_ENABLED=false` (2026-08-24, same day) — checking template approval
status surfaced a more urgent problem first: `WHATSAPP_ACCESS_TOKEN` turned
out to be a short-lived test/dev token that had already expired days earlier,
not a permanent System User token, so every send was failing on auth before
template approval even mattered. The flag stops both new WHATSAPP-channel
rows being queued and the sweep from retrying already-queued ones, without
affecting Email. Re-enable once a real System User token is generated and set
in `.env`/`docker-compose.yml` — at that point Meta template approval
(`notifications/requirements.md` §5) becomes the next thing to verify.
**Pending**: real sends do not work yet — each event's Meta message template
needs to be submitted and approved by Meta, an account-specific external step
this environment can't perform (`notifications/requirements.md` §5). Until
approved, the delivery sweep marks queued notifications `FAILED` with that
exact reason; this does not block any other part of the app.
[`See notifications/ for the full architecture and event contracts`](./notifications/)

## Security & Hardening Audit
**Status**: ✅ Implemented (Phase 9, tasks 9.1–9.5, all complete — a one-time
audit pass, not an ongoing feature).
**Scope implemented**: society-scoping audit (found + fixed one critical
cross-tenant bug), auth rate limiting, `express-async-errors` (fixed a
process-crashing gap), audit-trail verification (found + fixed a gap in monthly
generation), file-upload magic-byte verification (fixed a spoofable
Content-Type gap).
**Pending**: none known — see [`security-audit.md`](./security-audit.md) for
full findings; a future audit pass would need its own task, not tracked here as
pending.

## Bank Reference Capture
**Status**: 🟡 Phase 1 implemented (2026-08-27) plus a slice of Phase 2, same
day, built incrementally in the reverse order from the original design's epic
plan.
**Scope implemented**: `LedgerEntry.bankReference` (nullable column). Admin
must type it into `POST /api/admin/ledger-entries/:id/approve` (Zod-required,
400 without it) while looking at the resident's already-viewable proof
screenshot — the approve button in `ReceiptApprovalModal.tsx` stays disabled
until filled. This deliberately **supersedes**, for phase 1 only, two of the
original doc's "Confirmed Product Decisions": #3 (field optional at every
layer) and #5 (admin never re-types it, resident enters it via OCR) — see the
status note at the top of
[`bank-reference/01-requirements.md`](./bank-reference/01-requirements.md).
Same-day addition: `POST /api/admin/ledger-entries/:id/infer-bank-reference`,
an admin-triggered, read-only OCR pass (`tesseract.js`, self-hosted, no paid
API) against the entry's own proof image, regex-extracted via
`shared/billing/bank-reference-extractor.ts`
(GPay/PhonePe/Paytm/UTR-labeled/bare-12-digit heuristics) — surfaced as an
"Infer from proof" button in `ReceiptApprovalModal.tsx` that pre-fills the
(still freely editable) text box; a failed decode or empty extraction
degrades silently to "no reference detected," never blocking approval. Also
landed: Receipt Book (`ReceiptBookPage.tsx` + `admin-receipts-service.ts`)
now shows a "Bank Transaction" column reading `bankReference`, replacing the
former "Custom Fee" column (fee-type display/search dropped from this page
only — `receipt.service.ts`'s separate purpose-line mechanism is untouched).
**Pending (rest of phase 2)**: the resident-facing submission-time OCR-extract
flow (Epic 3/5 of
[`bank-reference/03-scope-and-task-breakdown.md`](./bank-reference/03-scope-and-task-breakdown.md))
and the `bankReferenceSource` provenance enum (R2) were not built — the
admin-side infer button has no provenance tracking, since the admin can edit
the inferred value freely before approving; `manualDeposit` (cash/bank-transfer,
admin-recorded) also still has no bank reference field.

## Vehicle Finder
**Status**: ✅ Implemented and deployed (2026-08-28). An OCR scan-assist was
also built same-day, tested against a real device photo, and rolled back
same-day — see `vehicle-finder/05-future-scope.md`'s item 5. Manual
plate-text search is the shipped state.
**Scope implemented (backend)**: `Vehicle` model (migration
`20260828072422_add_vehicle`, `@@unique([societyId, plateNumber])`),
`shared/vehicles/normalize-plate.ts`, resident self-service
`POST/GET/DELETE /api/me/vehicles[/:id]` (`features/vehicles/resident/`,
create-and-catch-P2002 duplicate handling same as `createFeeType`), and the
search endpoint `GET /api/vehicles/search` (`features/vehicles/lookup/`)
returning the matching flat's wing/flat number plus the registrant's name
and phone number on a hit, `{found:false}` on a miss — a pure read, no
`AuditLog` or any other row written, per
[`vehicle-finder/01-requirements.md`](./vehicle-finder/01-requirements.md)'s
Confirmed Product Decision #1. Tenancy-end cleanup (R8) is wired into all
three places an occupancy can end: `resident-flats-service.ts`'s
`removeOwnTenant`, `admin-flats-tenancy-service.ts`'s `removeTenant`, and
`flat-shared.ts`'s `applyOccupancy` (the combined flat-edit form's
"revert to owner-occupied" path, shared by `PUT /api/me/flat` and the
admin's flat update) — a departing tenant's vehicles are deleted in the same
transaction as the occupancy close, on every path. Test coverage:
`normalize-plate.test.ts`, `resident-vehicles.service.test.ts`,
`vehicle-lookup.service.test.ts`, `tenancy-cleanup.test.ts` (all three
cleanup sites), all under `server/tests/features/vehicles/` — 559/559 server
tests passing, `npm run build`/`lint` clean. Migration applied to the live
`smi_dev` database (no `prisma/` folder ships in the backend image, so this
ran from the host against the exposed `localhost:5432`, then
`docker compose up -d --build backend`).
**Scope implemented (frontend)**: `MyDetailsPage.tsx` gains a two-tab layout
("My Info" — existing content, unchanged and default-active; "Vehicle Info" —
`VehicleInfoTab.tsx`, a register form plus a `DataTable.tsx` list with a
delete action, React Query `invalidateQueries`-driven refetch after
register/delete). A standalone `VehicleFinderPage.tsx`
(`client/src/resident/vehicle-finder-page/`) provides the plate-search UI —
plain text input + submit, a `tel:` link on the occupant's phone number
(opens the dialer directly on mobile), result card on a hit, plain "not
found" message on a miss — routed at `/vehicle-finder` and reachable by
every role (`ADMIN`/`OWNER`/`TENANT`), unlike almost every other route in
this app. Nav entries added to both `ADMIN_NAV_ITEMS` and
`RESIDENT_NAV_ITEMS` in `DashboardLayout.tsx`. A test-only bug was found and
fixed along the way (not a production bug): the "Vehicle Info tab" test
mock's GET handler returned the live mutable vehicles array by reference
instead of a snapshot, letting a later POST's in-place push leak into an
in-flight GET's response and double-count a row — fixed by returning
`[...vehicles]`.
**OCR scan-assist — built, then rolled back, same day (2026-08-28)**: a
camera-icon control inside the search input captured a plate photo and ran
it through `ocr.ts` (client-side `tesseract.js`, WASM, never uploaded) +
`extract-plate.ts` (regex match against the Indian HSRP plate shape). Tested
against a real device photo before shipping any wider and it failed: the
photo's EXIF orientation was never corrected before handing it to tesseract
(a normal, sideways-stored phone photo read as pure noise), and even after
manually correcting orientation and cropping to just the plate, tesseract's
generic `eng` model still couldn't get a clean read against the embossed
plate font. Rolled back same day — `ocr.ts`/`extract-plate.ts` deleted, the
scan control removed from `VehicleFinderPage.tsx`, `tesseract.js` dropped
from the client's dependencies (server-side `tesseract.js`, used by
bank-reference OCR, is unrelated and untouched). Full detail:
[`vehicle-finder/01-requirements.md`](./vehicle-finder/01-requirements.md)'s
second 2026-08-28 addendum,
[`vehicle-finder/02-architecture.md`](./vehicle-finder/02-architecture.md)'s
OCR Scan-to-Search section, and
[`vehicle-finder/05-future-scope.md`](./vehicle-finder/05-future-scope.md)'s
item 5. 217/217 client tests passing (post-rollback), `npm run
build`/`lint` clean.
**Pending**: nothing known for the manual-search scope described above;
future-scope items (rate limiting, audit logging, opt-out, visitor/gate
integration, and OCR scan-assist itself if revisited with real preprocessing)
remain deliberately deferred — see
[`vehicle-finder/05-future-scope.md`](./vehicle-finder/05-future-scope.md).

## Complaints
**Status**: 📝 Designed, not built (2026-08-29). Brings a previously
out-of-scope item ("Complaints/helpdesk") back into scope for this app,
narrowed to owner-only issue logging with admin-moderated status and
community upvoting — see
[`docs/decisions/0007-complaints-back-in-scope.md`](../decisions/0007-complaints-back-in-scope.md).
**Scope implemented**: none yet. Full planned scope is in
[`complaints/01-requirements.md`](./complaints/01-requirements.md) and
[`complaints/02-architecture.md`](./complaints/02-architecture.md); task
breakdown and effort estimate in
[`complaints/03-scope-and-task-breakdown.md`](./complaints/03-scope-and-task-breakdown.md);
a mutually-exclusive parallel-build split for whoever implements this in
[`complaints/06-parallel-build-plan.md`](./complaints/06-parallel-build-plan.md).
**Pending**: everything — schema (`Complaint`/`ComplaintUpvote`), backend
(owner create/list/edit/delete/upvote, admin status transitions), frontend
(owner surface, admin surface, both dashboard integrations), and tests.
Deferred-beyond-v1 items (notifications, multi-image attachments, tenant
involvement, comments, a "my complaints" filter) are in
[`complaints/05-future-scope.md`](./complaints/05-future-scope.md).

## Society Onboarding — Bootstrap & Bulk Import
**Status**: ✅ Implemented (2026-08-21, all three phases from the original
design). Not to be confused with "Flat & Society Onboarding" above (Phase 3) —
that's per-flat onboarding within an already-existing society; this is
platform-level, for standing up a brand-new society (a new client) at all.
**Scope implemented**: Phase A — `POST /api/platform/societies`, gated by a
shared secret (`requirePlatformSecret`, no admin JWT can exist yet for a
society that doesn't), creates a `Society` + its first `ADMIN` in one
transaction and triggers a real password-reset link; no admin UI by design
(concierge/operator action). Phase C — `POST /api/admin/bulk-charges/import`,
bulk-imports one-time per-flat charges from CSV: a sentinel-period
(`"0000-01"`) Opening Balance `MaintenanceRecord` that always settles before
every real month (zero changes to `computeRecordSettlements`), or an
`OTHER_CHARGE` row reusing `billOtherCharge`'s exact validation. Phase E —
`POST /api/admin/society-ledger/import`, bulk-imports historical
income/expense into Manage Finance, skipping the mandatory-proof-file rule
(each row auto-flagged as historical/unverified in its note) via a validator
(`assertValidSocietyLedgerEntry`) extracted from `recordSocietyLedgerEntry` so
the bulk and single-row paths can't drift apart. All three importers (plus the
already-shipped Resident roster import, relocated here from
`FlatsListPage.tsx`) live under one admin-only **Imports** sidebar submenu —
`/imports/residents`, `/imports/charges`, `/imports/finance` — sharing one
frontend component (`CsvImportPanel.tsx`).
**Pending**: none of the original scope — see
[`society-onboarding/01-requirements.md`](./society-onboarding/01-requirements.md)'s
"Explicitly Out of Scope (v1)" for what was deliberately deferred (a self-serve
wizard, a real `SinkingFund` model, bulk import of catalog rows, multi-society
admin UX).

## Production Deployment
**Status**: ✅ Implemented (Phase 10, tasks 10.1–10.2, 2026-08-21).
**Scope implemented**: `nginx`'s config mount is now a directory
(`./nginx/conf.d`), enabling a live config swap without rebuilding the image; a
`certbot` service auto-renews a Let's Encrypt certificate; `scripts/enable-https.sh`
requests the first cert and swaps in `nginx/https.conf.template`. Confirmed
decision: no purchased domain for this pilot (pre-revenue) — HTTPS is obtained
against a free dynamic-DNS hostname (DuckDNS or similar) instead, since Let's
Encrypt only requires a resolvable FQDN, not a registrar-purchased one. Plain HTTP
(no `DOMAIN` set) remains fully supported — nothing else in the stack requires TLS.
Full sequence: [`DEPLOY.md`](../../DEPLOY.md).
**Resolved 2026-08-27**: database backups. Weekly `pg_dump` job
(`server/src/infrastructure/backup/`, `src/jobs/database-backup.job.ts`,
Sundays 02:30 IST) live against a real, separate R2 bucket/credential
(`BACKUP_S3_*`) — verified with a real manual run. See File Storage's row
below and `docs/decisions/0005-storage-provider-r2.md`.

## Society-Level Income/Expense
**Status**: ✅ Implemented, via the Manage Finance feature above (2026-08-20).
This entry originally tracked the idea before it had a name or a doc folder —
surfaced during the same financial-audit-readiness review that produced
`bank-reference/`. `bank-reference/05-future-scope.md` item 2 still describes it
as a future, undesigned item; that reference is now stale — see
[`manage-finance/`](./manage-finance/) for the real, built feature (a
`SocietyLedgerEntry` model, independent of `Flat`, deliberately separate from
the flat-scoped `LedgerEntry`). Row kept here for history rather than deleted.
**Pending**: nothing under this name — see Manage Finance's own Pending list
above for what's still deferred within that feature.

## File Storage
**Status**: ✅ Implemented (2026-08-26).
**Scope implemented**: `S3StorageAdapter` (Cloudflare R2, S3-compatible)
alongside the existing `LocalStorageAdapter`, swappable via
`STORAGE_PROVIDER`. One-time migration script moved existing local files to
R2 preserving their keys — live deployment cut over, 8/8 files migrated and
read-verified.
**Pending**: nothing — weekly Postgres backup job (separate R2
bucket/credential from live file storage) built and confirmed live
2026-08-27. See `docs/decisions/0005-storage-provider-r2.md`.

## Committee & Signatures
**Status**: ✅ Implemented, including a 2026-08-26 approval gate.
**Scope implemented**: Chairman/Secretary/Treasurer role assignment,
per-role signature image upload, dual Chairman+Secretary signing on issued
receipts (2026-08-17). New 2026-08-26: approving a Deposit is blocked (409)
while neither Chairman nor Secretary has a signature configured — a receipt
is issued at approval time, and a fully blank signatory block isn't
acceptable output.
**Pending**: none known.
