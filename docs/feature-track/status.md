# Feature Track

A single index of every feature/capability area in this app — what's built, what
scope it covers, and what's still pending — cutting across `docs/` **by feature**,
not by phase. This complements
[`../task-status.md`](../task-status.md) (the phase-by-phase, task-numbered
checklist) rather than replacing it: that file answers "which of the original
11 phases/tasks are done," this one answers "for a given capability, is it live,
and what's left." Status here is derived from `docs/task-status.md`, each
feature's own doc set, and `git log`, verified at the time this file was
last updated (2026-08-24) — re-check against those sources if this file looks stale.

## Summary

| Feature | Docs | Status | Notes |
|---|---|---|---|
| Auth & Access Control | [`auth.md`](../auth.md) | ✅ Implemented | Phase 2, complete |
| Flat & Society Onboarding | [`flats.md`](../flats.md) | ✅ Implemented | Phase 3, complete incl. 2026-08-06 resident self-service redesign |
| Maintenance Records | [`maintenance-records.md`](../maintenance-records.md) | ✅ Implemented | Phase 4, complete incl. arrears-billing fix |
| Payments — Ledger, QR, Bank Transfer | [`payments.md`](../payments.md) | ✅ Implemented | Phase 6, complete through the 2026-08-20 final Credit removal (Deposit cap on Outstanding lifted instead) |
| Admin Dashboard | [`admin-dashboard.md`](../admin-dashboard.md) | ✅ Implemented | Phase 8, complete incl. 2026-08-24 Outstanding card-group consolidation |
| Receipts — Generation & Approval | [`receipts.md`](../receipts.md) | ✅ Implemented | 2026-08-11 addition, complete incl. Chairman/Secretary signing + Receipt Book |
| Other Charges | [`other-charges/`](../other-charges/) | ✅ Implemented | 2026-08-19, updated 2026-08-21 (partial payment disallowed); 9 items explicitly deferred, see its own future-scope doc |
| Manage Finance | [`manage-finance/`](../manage-finance/) | ✅ Implemented | 2026-08-20; society-level income/expense ledger (`SocietyLedgerEntry`), fully separate from the resident-billing `LedgerEntry` — realizes the "Society-Level Income/Expense" idea below |
| Observability | [`observablity/`](../observablity/) | 🟡 Partially implemented | Stage 1 only (logging); 6 further stages deferred |
| Notifications — Email | `auth.md` (send mechanism) + `task-status.md` Phase 7 | 🟡 Partially implemented | Password-reset send confirmed live 2026-08-24 (`smi.techsanket.in` verified on Resend); the 3 per-event triggers now live in the shared pipeline below, not built separately here |
| Notifications — Event-Driven (WhatsApp + Email) | [`notification/`](../notification/) | 🟡 Email live, WhatsApp switched off | 3 events × 2 channels; Email fully working since 2026-08-24; WhatsApp disabled via `WHATSAPP_ENABLED=false` (its access token expired — needs a permanent System User token, then Meta template approval) |
| Security & Hardening Audit | [`security-audit.md`](../security-audit.md) | ✅ Implemented | Phase 9, one-time audit, 5 findings fixed |
| Bank Reference Capture | [`bank-reference/`](../bank-reference/) | ⬜ Documented, not implemented | Full design ready; 0 of 7 epics (~14h) built |
| Society Onboarding — Bootstrap & Bulk Import | [`society-onboarding/`](../society-onboarding/) | ✅ Implemented | 2026-08-21; distinct from "Flat & Society Onboarding" above (per-flat, Phase 3) — this is platform-level: creating a brand-new `Society`+first `ADMIN`, plus bulk-importing a client's historical arrears/charges/finance data |
| Production Deployment | [`DEPLOY.md`](../../DEPLOY.md) | ✅ Implemented | 2026-08-21; HTTPS via a free dynamic-DNS hostname, not a purchased domain — see DEPLOY.md and `CLAUDE.md`'s "Addition (2026-08-21)" |
| Society-Level Income/Expense | [`manage-finance/`](../manage-finance/) | ✅ Implemented via Manage Finance | Was tracked here as an idea; built 2026-08-20 as Manage Finance (see above) — row kept for history |

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
directly above the deposit list it feeds.
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
when both Outstanding and Credit are zero (2026-08-24).
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
[`other-charges/05-future-scope.md`](../other-charges/05-future-scope.md)):
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
can't drift apart.
**Pending** (all explicitly deferred, see
[`manage-finance/05-future-scope.md`](../manage-finance/05-future-scope.md)):
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
[`observablity/06-future-scope.md`](../observablity/06-future-scope.md)):
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
ever call `notify(event)`. Full mechanism: `docs/notification/architecture.md`'s
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
(`notification/requirements.md` §5) becomes the next thing to verify.
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
**Pending**: database backups — there is no backup/restore mechanism anywhere in
this stack (`postgres_data` is a single Docker volume on one VPS, no copy
elsewhere). Not in Task 10.1/10.2's original scope; flagged in `DEPLOY.md` as a
follow-up, no confirmed trigger yet.

## Society-Level Income/Expense
**Status**: ✅ Implemented, via the Manage Finance feature above (2026-08-20).
This entry originally tracked the idea before it had a name or a doc folder —
surfaced during the same financial-audit-readiness review that produced
`bank-reference/`. `bank-reference/05-future-scope.md` item 2 still describes it
as a future, undesigned item; that reference is now stale — see
[`manage-finance/`](../manage-finance/) for the real, built feature (a
`SocietyLedgerEntry` model, independent of `Flat`, deliberately separate from
the flat-scoped `LedgerEntry`). Row kept here for history rather than deleted.
**Pending**: nothing under this name — see Manage Finance's own Pending list
above for what's still deferred within that feature.
