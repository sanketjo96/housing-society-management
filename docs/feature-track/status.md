# Feature Track

A single index of every feature/capability area in this app — what's built, what
scope it covers, and what's still pending — cutting across `docs/` **by feature**,
not by phase. This complements
[`../task-status.md`](../task-status.md) (the phase-by-phase, task-numbered
checklist) rather than replacing it: that file answers "which of the original
11 phases/tasks are done," this one answers "for a given capability, is it live,
and what's left." Status here is derived from `docs/task-status.md`, each
feature's own doc set, and `git log`, verified at the time this file was
written (2026-08-20) — re-check against those sources if this file looks stale.

## Summary

| Feature | Docs | Status | Notes |
|---|---|---|---|
| Auth & Access Control | [`auth.md`](../auth.md) | ✅ Implemented | Phase 2, complete |
| Flat & Society Onboarding | [`flats.md`](../flats.md) | ✅ Implemented | Phase 3, complete incl. 2026-08-06 resident self-service redesign |
| Maintenance Records | [`maintenance-records.md`](../maintenance-records.md) | ✅ Implemented | Phase 4, complete incl. arrears-billing fix |
| Payments — Ledger, QR, Bank Transfer | [`payments.md`](../payments.md) | ✅ Implemented | Phase 6, complete through the 2026-08-12 bank-transfer fallback |
| Admin Dashboard | [`admin-dashboard.md`](../admin-dashboard.md) | ✅ Implemented | Phase 8, complete incl. 2026-08-09 collection-rate fix |
| Receipts — Generation & Approval | [`receipts.md`](../receipts.md) | ✅ Implemented | 2026-08-11 addition, complete incl. Chairman/Secretary signing + Receipt Book |
| Other Charges | [`other-charges/`](../other-charges/) | ✅ Implemented | 2026-08-19; 9 items explicitly deferred, see its own future-scope doc |
| Observability | [`observablity/`](../observablity/) | 🟡 Partially implemented | Stage 1 only (logging); 6 further stages deferred |
| Notifications — Email | `auth.md` (send mechanism) + `task-status.md` Phase 7 | 🟡 Partially implemented | Send mechanism live; most individual triggers unbuilt (superseded by WhatsApp for 3 of them) |
| Notifications — WhatsApp | [`notification/`](../notification/) | 🟡 Code complete, external step pending | 3 events wired end-to-end; blocked on Meta template approval |
| Security & Hardening Audit | [`security-audit.md`](../security-audit.md) | ✅ Implemented | Phase 9, one-time audit, 5 findings fixed |
| Bank Reference Capture | [`bank-reference/`](../bank-reference/) | ⬜ Documented, not implemented | Full design ready; 0 of 7 epics (~14h) built |
| Society Onboarding — Bootstrap & Bulk Import | [`society-onboarding/`](../society-onboarding/) | ✅ Implemented | 2026-08-21; distinct from "Flat & Society Onboarding" above (per-flat, Phase 3) — this is platform-level: creating a brand-new `Society`+first `ADMIN`, plus bulk-importing a client's historical arrears/charges/finance data |
| Production Deployment | — (no doc yet) | ⬜ Not started | Phase 10, both tasks unchecked |
| Society-Level Income/Expense | — (no doc yet) | ⬜ Idea only | Surfaced during the bank-reference audit review; not designed |

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
→ per-record settlement status derived via FIFO → UPI/bank-transfer fallback).
**Scope implemented**: payment-intent lock → QR (UPI) or bank details (fallback)
→ optional-proof Deposit submission → admin approve/reject → manual mark-paid
fallback → Credit (mandatory-proof committee adjustment) → derived per-record
settlement status for Maintenance Book/escalation.
**Pending**: no bank/UPI transaction reference captured on a Deposit — this is
exactly the gap `bank-reference/` (below) is designed to close, not yet built.

## Admin Dashboard
**Status**: ✅ Implemented (Phase 8, tasks 8.1–8.4, all complete, rewritten
against the ledger model).
**Scope implemented**: outstanding total + collection-rate widget (deposits-only
formula since the 2026-08-09 fix), flat-wise dues table, pending-proofs widget,
flagged-flats escalation widget (configurable grace period).
**Pending**: none known.

## Receipts — Generation & Approval
**Status**: ✅ Implemented (2026-08-11 addition, Phase 3-addendum-style task
outside the original numbering; all sub-items complete).
**Scope implemented**: approval-preview modal (byte-identical to the issued PDF),
deterministic receipt numbering, `manualDeposit` also issues a receipt, admin
Settings receipt-template fields + signature upload, Chairman/Secretary dual
signatory (2026-08-17), admin Receipt Book register (2026-08-18) with
dashboard-only, proof-filtered Payment Proofs tabs.
**Pending**: none known — legacy pre-2026-08-11 entries have no receipt and are
deliberately never backfilled (a documented, permanent state, not a gap).

## Other Charges
**Status**: ✅ Implemented (commit `d1af274`, 2026-08-19).
**Scope implemented**: admin-configurable Fee Types catalog, one-off billing to a
flat's owner, a fully separate Outstanding pool (own dashboard cards, own book
page, own Pay flow), reusing the existing approval queue/receipts/notifications.
**Pending** (all explicitly deferred, see
[`other-charges/05-future-scope.md`](../other-charges/05-future-scope.md)):
bulk/multi-flat billing, tenant-as-payer, editing/voiding a charge, Other-Charges
Credit, escalation extended to this pool, per-charge due dates, CSV import,
default fee amounts, hard delete of a fee type. None have a confirmed trigger.

## Observability
**Status**: 🟡 Partially implemented — Stage 1 only (commit `7c445aa`,
2026-08-19).
**Scope implemented**: structured logging via Pino, request logging, crash
capture.
**Pending** (see
[`observablity/06-future-scope.md`](../observablity/06-future-scope.md)):
request correlation across features, centralized log aggregation (Grafana
Loki), metrics (Prometheus + Grafana), distributed tracing (OpenTelemetry +
Tempo), dashboards & on-call alerting, multi-tenant observability. No stage has
a confirmed trigger yet.

## Notifications — Email
**Status**: 🟡 Partially implemented.
**Scope implemented**: `EmailProvider` interface (`console`/`resend`), wired
into password reset — every caller (Task 2.4's flow, 2026-08-06 self-service
tenant creation, admin flat onboarding) sends a real email automatically.
**Pending** (`task-status.md` Phase 7, tasks 7.2–7.6, unchecked): the original
per-event email triggers (maintenance-record-generated, proof-submitted,
proof approved/rejected, an escalation job) were never built as *email* —
three of the equivalent business events (bill generated, deposit approved,
credit approved) are instead now covered by WhatsApp (below). The escalation
job (7.6) specifically has no automated notification path at all — the
Admin Dashboard's flagged-flats widget only prepares a message for the admin
to manually share, by design (rule 8).

## Notifications — WhatsApp
**Status**: 🟡 Code complete, blocked on an external step (commit `a99f40d`).
**Scope implemented**: full pipeline — `NotificationLog`-as-queue, a 1-minute
cron delivery sweep, Meta Cloud API client, idempotency (unique key, no
duplicate sends), transient-vs-permanent failure handling — wired end-to-end
for three events: `MAINTENANCE_BILL_GENERATED`, `DEPOSIT_PAYMENT_APPROVED`,
`CREDIT_PAYMENT_APPROVED`. Verified against a mocked WhatsApp client.
**Pending**: real sends do not work yet — each event's Meta message template
needs to be submitted and approved by Meta, an account-specific external step
this environment can't perform (`notification/requirements.md` §5). Until
approved, the delivery sweep marks queued notifications `FAILED` with that
exact reason; this does not block any other part of the app.
[`See notification/ for the full architecture and event contracts`](../notification/)

## Security & Hardening Audit
**Status**: ✅ Implemented (Phase 9, tasks 9.1–9.5, all complete — a one-time
audit pass, not an ongoing feature).
**Scope implemented**: society-scoping audit (found + fixed one critical
cross-tenant bug), auth rate limiting, `express-async-errors` (fixed a
process-crashing gap), audit-trail verification (found + fixed a gap in monthly
generation), file-upload magic-byte verification (fixed a spoofable
Content-Type gap).
**Pending**: none known — see [`security-audit.md`](../security-audit.md) for
full findings; a future audit pass would need its own task, not tracked here as
pending.

## Bank Reference Capture
**Status**: ⬜ Documented, not implemented — design complete, zero code written.
**Scope implemented**: none. Full design exists in
[`bank-reference/`](../bank-reference/) (requirements, architecture, task
breakdown, roadmap, future scope) — OCR-assisted capture of a bank/UPI
transaction reference on Deposit submission, server-computed provenance,
admin-visible (not re-typed) at approval.
**Pending**: all 7 epics — schema, OCR engine, resident submission flow, admin
paths, resident/admin frontend surfaces, tests (~14 hours estimated, see
[`bank-reference/03-scope-and-task-breakdown.md`](../bank-reference/03-scope-and-task-breakdown.md)).

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
[`society-onboarding/01-requirements.md`](../society-onboarding/01-requirements.md)'s
"Explicitly Out of Scope (v1)" for what was deliberately deferred (a self-serve
wizard, a real `SinkingFund` model, bulk import of catalog rows, multi-society
admin UX).

## Production Deployment
**Status**: ⬜ Not started (Phase 10, tasks 10.1–10.2, both unchecked).
**Scope implemented**: none beyond the dev-oriented Docker Compose setup from
Phase 0 (`docker-compose.md`).
**Pending**: a production-ready Docker Compose (10.1), `DEPLOY.md` + Certbot SSL
setup (10.2). No dedicated feature doc exists yet for this phase.

## Society-Level Income/Expense
**Status**: ⬜ Idea only — surfaced during a financial-audit-readiness review
(the same review that produced `bank-reference/`), not yet designed.
**Scope implemented**: none.
**Pending**: everything. Proposed shape (not confirmed): a new
`SocietyLedgerEntry`/`SocietyTransaction` model, independent of `Flat`, for
money the society itself pays out or receives (vendor payments, salaries, bank
interest) — deliberately kept separate from `LedgerEntry`, which is always
flat-scoped. No doc folder exists for this yet; see
[`bank-reference/05-future-scope.md`](../bank-reference/05-future-scope.md)
item 2 for the one place it's currently written down.
