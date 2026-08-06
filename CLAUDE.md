# CLAUDE.md — Housing Society Management (MVP)

Persistent project rules. Read in full before starting any task. Source of truth for
business rules is `docs/requirements.md` (mirrors the original requirements doc), as
amended by the pivot below — this file exists to keep the rules and confirmed decisions
in context during implementation. The phase/task breakdown lives in the task tracker
**`task-prompts-v1`** (supersedes the original `task-prompts` — the original quarterly
invoicing design is preserved there for history but is no longer current) — 11 phases
(0–10), authoritative for what to build next and in what order. Phase 5 (originally
"quarterly invoicing") is dissolved; its tasks are marked `REMOVED` in the tracker, with
their remaining useful concerns folded into Phase 4 and Phase 8.

### Pivot (2026-08-05): quarterly `Invoice` bundling dropped

Original design: `MaintenanceRecord`s were monthly/accrual-only, bundled 3-at-a-time
into a quarterly `Invoice`, which was the only payable entity. **This has been
replaced**: `MaintenanceRecord` is now independently payable immediately after
generation — no bundling, no quarter to wait for. A resident sees their live
outstanding balance (however many unpaid months exist) and may select any combination
of unpaid records to settle in a single payment. Every record stays a clean
paid/unpaid binary; "partial payment" means *selecting a subset of records*, never
splitting one record's amount. The business rules below reflect the current (post-pivot)
design; see `docs/data-model.md`'s pivot note and `task-prompts-v1` for full reasoning.

### Addition (2026-08-06): resident self-service — own profile + tenant management

Confirmed against a shared resident-view UI mockup (`ResidentExperience`'s "My
details" tab): an authenticated resident (`OWNER` or `TENANT`) may update their own
`name`/`phone`/`email` directly — no admin action required. Beyond that, an `OWNER`
may also create, update, or remove the `TENANT` currently associated with their own
flat, from their own resident view.

**This is additive, not a replacement.** The admin-only endpoints from Task 3.2
(`POST`/`DELETE /api/admin/flats/:id/tenant`) stay exactly as built — for an admin
correcting a resident's mistake or acting on their behalf. The new resident-facing
endpoints are a second, narrower path for the common case (an owner instating their
own tenant), scoped to `req.user.id === flat.ownerId`, not a general admin capability.

**What stays admin-only, unchanged**: `wing`, `flatNumber`, and `baseRate` are set at
flat onboarding (Task 3.1) and remain **read-only from the resident side** — a
resident sees these fields but cannot edit them from their own view (matches the
mockup: those inputs are rendered `disabled`, with "Set by your society admin and
can't be changed here"). Flat onboarding itself (creating a new `Flat` row at all)
also stays admin-only.

**Interaction model differs deliberately from the admin endpoints**: Task 3.2's
`assignTenant` rejects re-assignment if the flat already has a tenant
(`TenantAlreadyAssignedError`) — an admin must call `removeTenant` first. The
resident-facing equivalent instead **updates the existing tenant's details in place**
when one is already assigned, matching the mockup's single "Save changes" button over
one form (occupancy toggle + tenant fields together) rather than a two-step
remove-then-assign flow. Removing a tenant entirely (toggling back to owner-occupied)
still closes the open `OccupancyChange` row, same underlying mechanism as Task 3.2.

**How a self-service-created tenant gets a working login**: when an owner "creates" a
tenant (name/phone/email in the mockup — no password field), the backend creates a
real `TENANT` `User` immediately, given a random, unusable password, then triggers the
same password-reset mechanism Task 2.4 already built (`requestPasswordReset()`,
currently stubbed to log the reset link rather than email it — Phase 7 replaces the
stub with a real send). The tenant sets their own password via that link and logs in
normally afterward. No new account-provisioning subsystem — this reuses two
already-built pieces (user creation, password reset) instead of inventing an invite
flow. **Not public self-signup** (still out of scope, unchanged): the account is
created by an authenticated resident, for a specific person tied to their own flat,
never open to the public.

**Not yet built** — this is a requirements/scope decision, not an implementation yet.
Tracked as a Phase 3 addendum in `docs/task-status.md` (outside the original
`task-prompts-v1` numbering, since this wasn't in the original tracker).

### Addendum (2026-08-06, same day): Task 3.1/3.2 redesigned to match the admin mockup

Confirmed against a second shared UI mockup (`AdminExperience`'s "Flats and
residents" tab): the real admin flat-onboarding workflow is **one form** — wing,
flat number, base rate, owner contact, occupancy, tenant contact — saved together,
with no separate "create the owner's account first" step. Tasks 3.1/3.2 as originally
built required a pre-existing `ownerId`/`tenantId`; this was confirmed as a genuine
**breaking change** to that already-shipped contract (Task 3.1 had already been
committed and pushed) rather than a new addition, and applied: `createFlat`/
`updateFlat` now take owner/tenant **contact fields** and find-or-create the
underlying accounts inline, reusing the exact same mechanism (`findOrCreateUserByEmail`
— random unusable password + the existing password-reset stub) established just above
for resident self-service. The id-based `assignTenant`/`removeTenant` (Task 3.2) were
kept as a lower-level alternative, not removed, since they still have a legitimate use
case (linking an already-known account without re-typing its details) and were already
tested. Full mechanism and the exact request/response contracts: `docs/flats.md`.

## Project overview

Web app for a single residential housing society's committee: flat onboarding, monthly
maintenance accrual (independently payable per month, see pivot note above), UPI-based
payment collection with manual proof verification, and email notifications including
overdue-dues escalation.

- Initial scale: one society, ~24 flats. Schema must not require a rewrite to onboard a
  second society later, but multi-society UX (society switching, cross-society admin) is
  explicitly out of scope for this MVP.
- Deployment target: self-hosted VPS (7.6GB RAM, 55GB disk), via Docker Compose.

## Personas

- **Admin** (committee member): onboards flats, reviews payment proofs, monitors dues.
- **Owner**: owns a flat, may or may not live in it. Views own dues, pays via QR.
  Manages their own contact details and their flat's current tenant (§ Addition
  2026-08-06, above) — but not the flat's admin-set fields (wing, flat number, base
  rate), which stay read-only from the resident side.
- **Tenant**: rents from an owner. Same as owner, but billed at a higher rate while
  occupying. May also update their own contact details.

## Core business rules (authoritative — do not deviate without confirming)

1. **Rate logic**: owner-occupied flat pays 1x base rate. Tenant-occupied flat pays 1.5x
   (configurable factor), billed to the tenant, not the owner.
2. **Occupancy is tracked historically** via `OccupancyChange`, not a single current flag
   — a flat's occupancy can change mid-quarter and past billing periods must retain the
   rate that actually applied at the time.
3. **Maintenance records are monthly and always a SYSTEM charge.** One record per flat
   per calendar month, storing the rate/amount/payer type for that month, generated
   with a `dueDate` (still used for escalation). Under the ledger pivot (§ below), a
   `MaintenanceRecord` is never individually marked paid — it permanently contributes
   its `amount` to the flat's `totalCharges`; payment is tracked separately, against the
   running balance, in `LedgerEntry`.
4. **A resident's Payable is a single running balance, not a sum of unpaid months.**
   `Outstanding` = `totalCharges` − approved Deposits (floored at 0); `Credit balance` =
   approved Credits; `Payable` = `Outstanding` − `Credit balance` (floored at 0). See
   § Ledger Pivot below for the full formula and reasoning.
5. **Cadence**: exactly 12 maintenance records per flat per year (one per month).
6. **Payment is against the aggregate balance — explicit partial payment is allowed.**
   A resident may pay any amount from ₹1 up to the current Payable in one Deposit;
   paying less than the full amount is expected and fine, not an error case. This is a
   deliberate reversal of the original per-record "no partial payment" rule (see
   § Ledger Pivot below) — there is no longer a concept of selecting specific records to
   pay.
7. **Payment method (this phase): UPI QR + manual proof verification, proof now
   optional.** No payment gateway integration (that's Phase 2, out of scope here). Flow:
   - Resident views the three running balances → enters any amount up to Payable → sees
     a QR encoding a UPI deep link for that amount.
   - Resident pays via any UPI app. Uploading a screenshot/PDF as proof is now
     **optional**, not required, to submit the Deposit (reversal of the original
     mandatory-proof rule — see § Ledger Pivot below).
   - The Deposit is created at `status: PENDING`.
   - Admin approves (→ `APPROVED`, now counts toward the balance) or rejects (→
     `REJECTED`, resident notified with optional reason, may re-submit).
   - Admin manual "mark as paid" fallback for cash/bank-transfer creates an
     already-`APPROVED` Deposit directly, logged distinctly in the audit trail
     (`MANUAL_MARK_PAID`, separate from QR-flow approvals).
   - **Add credit** (new, § Ledger Pivot below): a resident may separately log an
     advance deposit or expense reimbursement (Amount, Note, optional screenshot) as a
     Credit, `status: PENDING` until admin-approved, which then offsets Payable.
8. **Escalation**: a flat with Payable > 0 whose oldest maintenance charge is past due
   date + grace period → flagged. System computes the flat's outstanding total (its full
   Payable, not just the overdue portion) and prepares a message; admin manually shares
   it (no auto-post to WhatsApp — see out-of-scope list, compliance risk).
9. **Notifications are email-only this phase.** WhatsApp Business API is Phase 2.
10. **Resident self-service** (added 2026-08-06): an `OWNER`/`TENANT` may update their
    own `name`/`phone`/`email` without admin involvement. An `OWNER` additionally has a
    single combined "My details" form — Flat details (locked), Owner details, Occupancy,
    conditional Tenant details, one Save — that both edits their own identity and
    manages their flat's current `TENANT` in one request (`PUT /api/me/flat`, § Ledger
    Pivot below); a `TENANT` only edits their own profile. Does not extend to admin-set
    flat fields (`wing`/`flatNumber`/`baseRate`) or to creating new `Flat` rows — see the
    "Addition (2026-08-06)" section above for the original mechanism and reasoning.

### Addendum (2026-08-06, same day): monthly generation switched to arrears billing

Confirmed while reviewing the interaction between `calculateMonthlyRate`'s
majority-of-days rule and the monthly generation cron's original timing. **Was**:
generation defaulted to the *current* calendar month, run at 00:05 on the 1st (forward
billing — bill for August on August 1st). **Now**: generation defaults to the
*previous* calendar month (`previousPeriod()`), run at the same 00:05-on-the-1st cron
time, but generating for the month that just ended.

**Why this was a real bug, not a style preference**: the majority-of-days rule can only
be evaluated correctly once every day of the target month has actually happened —
generating on Aug 1st for August cannot know about a tenant assigned or removed on Aug
10th, because that hasn't happened yet. Generation never re-runs for a period once
records exist (idempotency is a hard requirement, above), so that August record would
have been permanently wrong — locked in at whatever occupancy existed at 00:05 on Aug
1st, regardless of what actually happened the rest of the month. Arrears billing
(generate Sept 1st for August) guarantees the full month's `OccupancyChange` history
already exists in the DB before the rate is calculated.

**Practical effect on `dueDate`**: still generation time + 15 days (unchanged), but the
meaning shifts — residents now pay for *last* month within 15 days of it ending,
instead of paying for the *current* month while it's still in progress. `currentPeriod()`
is kept as a named export (some future caller may legitimately want "the in-progress
month," e.g. a preview), but `generateMaintenanceRecords`'s default, the manual-trigger
endpoint's default, and the cron are all now `previousPeriod()`. Full reasoning and a
worked example: `docs/maintenance-records.md`.

### Addendum (2026-08-06, same day): admin Settings tab for billing-rule values

`Society.tenantRateFactor` (rule 1's configurable multiplier) had a schema column and
a default value since the Phase 1 review, but **no admin UI to ever change it** —
confirmed as a real gap, not by design. Added `GET`/`PATCH /api/admin/settings`
(admin-only) plus a new "Settings" tab on `/dashboard`, alongside "Flats and
residents". Two fields: **tenant occupancy factor** (`tenantRateFactor`, feeds
`calculateMonthlyRate` directly — a change takes effect on the very next generation
run) and **default base rate** (`defaultBaseRate`, a new `Society` column that only
pre-fills the base-rate field when onboarding a *new* flat in the admin UI).

**Explicitly scoped to avoid a bigger, unrequested change**: `Flat.baseRate` stays
per-flat, independently editable per flat exactly as it already was (confirmed via
`AskUserQuestion` before implementing, given a per-flat-vs-society-wide base rate is a
real fork with different schema implications) — `defaultBaseRate` never overrides an
existing flat's rate, and calculations never read it. Only `tenantRateFactor` is
actually consumed by billing logic. Full contract and worked reasoning:
`docs/maintenance-records.md`'s "Admin settings" section, `docs/data-model.md`'s
`Society.defaultBaseRate` note.

### Pivot (2026-08-06): resident view moves to a transaction ledger (Passbook + My details)

Confirmed against an updated resident-experience UI mockup (`resident-experience
(4).jsx`, fetched via the Google Drive connector). This **replaces** the
record-selection payment model rules 3/6/7 originally described (select specific
`UNPAID` records → pay their exact sum → cascade to `PAID`) with a **balance-based
ledger**, the same category of change as the 2026-08-05 Invoice pivot — a real reversal
of a previously-confirmed rule (rule 6's "no partial payment"), not an additive tweak.

**The model**: every resident-visible row is one of three types — **SYSTEM** (an
auto-generated monthly charge, i.e. a `MaintenanceRecord` — always implicitly
"Approved," never individually editable or payable on its own), **Deposit** (created
when a resident pays via UPI, starts `PENDING`), or **Credit** (an advance deposit or
expense reimbursement the resident logs, starts `PENDING`, covers both cases in one
action). Only `APPROVED` rows count toward three running numbers:

```
totalCharges     = sum(MaintenanceRecord.amount) for the flat, every row
approvedDeposits = sum(LedgerEntry.amount) where type=DEPOSIT, status=APPROVED
approvedCredits  = sum(LedgerEntry.amount) where type=CREDIT,  status=APPROVED

Outstanding    = max(0, totalCharges - approvedDeposits)
Credit balance = approvedCredits
Payable        = max(0, Outstanding - Credit balance)
```

`PENDING`/`REJECTED` rows stay visible in the resident's Passbook for transparency but
are excluded from all three sums. A resident may pay **any amount up to Payable** —
explicit, deliberate partial payment against the aggregate balance, not against
specific months (there is no longer a concept of "select which records to pay").

**Design decision: additive schema change, not a full replacement.** Rather than
unifying SYSTEM/Deposit/Credit into one new polymorphic table (which would require
migrating `MaintenanceRecord`'s generation/idempotency/rate-calc history),
`MaintenanceRecord` is kept exactly as generated (Phase 4's arrears billing,
`calculateMonthlyRate`, idempotency — all untouched); only its `status`
(`PaymentStatus`) column is dropped, since a charge is never individually "paid"
anymore. A new model, `LedgerEntry`, holds only Deposit/Credit rows and **replaces**
`PaymentProof` entirely — its many-to-many "one proof covers N selected records" shape
no longer applies once payment is against an aggregate, not specific months. Full
schema: `docs/data-model.md`'s "LedgerEntry" section.

**Two further rule reversals, both explicit in the new spec, not incidental:**
- **Proof upload is now optional for a Deposit** (was mandatory, rule 7) — the
  mockup's "Upload payment proof" button in the Pay panel is decorative/unwired, and the
  written spec's Pay flow only requires an amount.
- **Escalation (rule 8) redefined**: since a Deposit is no longer tied to specific
  charges, there's no per-charge paid/unpaid state to check. A flat is flagged when
  `Payable > 0 AND` its **oldest** `MaintenanceRecord.dueDate` is past
  `dueDate + gracePeriodDays` — the natural generalization of "you still owe money and
  your oldest bill has been sitting a while." `outstandingTotal` in the flagged-flat
  response is the flat's full Payable, matching rule 8's "computes outstanding total...
  across all that flat's unpaid records" wording.

**My details also changes** (Passbook's sibling tab): the resident-facing form now
matches the admin flat-edit form's exact visual shape (Flat details locked, Owner
details/Occupancy/Tenant details fully editable), submitted as **one combined
request**, `PUT /api/me/flat` (OWNER only), reusing `updateFlat`'s existing
find-or-create-tenant-inline mechanism (`flats.service.ts`, the 2026-08-06 addendum)
rather than duplicating it — `wing`/`flatNumber`/`baseRate` are still never accepted.
This replaces the previous three-endpoint split (`PATCH /api/me` + `PUT`/`DELETE
/api/me/flat/tenant`) as the primary resident-side path; those lower-level endpoints
are kept, unremoved, same precedent as the admin id-based `assignTenant`/`removeTenant`
alongside `createFlat`/`updateFlat`. A `TENANT` keeps the simpler original
flow (read-only flat info + their own profile) — occupancy/tenant management stays an
`OWNER`-only capability, unchanged.

**Explicitly out of scope**: the mockup's decorative floor/unit occupancy-grid sidebar
(`FacadeMini`) is hardcoded demo chrome, not derived from real data, and needs
floor-plan geometry this schema doesn't model — not built. Full contract, endpoint
list, and manual verification: `docs/payments.md`, `docs/admin-dashboard.md`.

### Confirmed decisions (resolved during requirements intake, 2026-08-05)

- **Mid-month occupancy transition rate** (Task 4.1): for a flat's month, sum days under
  each occupancy status (OWNER vs TENANT). Whichever status has more days sets the rate
  for the *entire* month's single MaintenanceRecord. **On an exact tie** (only possible
  in 28- or 30-day months), **the status active on the last day of the month wins.**
  Example: owner-occupied Aug 1–10, tenant Aug 11–31 → tenant has majority (21 vs 10
  days) → whole month billed at tenant rate. **Generalized during implementation**
  (2026-08-06) beyond the owner-vs-tenant framing above, to "whichever specific party
  — the owner, or any one tenant — occupied the most days": a tenant-to-tenant
  turnover mid-month (Tenant A moves out, Tenant B moves in the same month) is billed
  to whichever tenant had the majority of days, same tiebreak logic, rather than
  needing a special case not covered by the original example. See
  `docs/maintenance-records.md`.
- **MaintenanceRecord due date**: generation date + 15 days (was "Invoice due date"
  pre-pivot — same default value, now attached to the record itself).
- **Escalation grace period**: 7 days past due date (configurable — implemented as an
  optional `?gracePeriodDays=` query param on `GET /api/admin/dashboard/flagged-flats`,
  Phase 8, rather than a new persisted `Society` setting; see `docs/admin-dashboard.md`).
- **Test runner**: Vitest for both `server/` and `client/` (Task 0.1 leaves this open;
  chosen for a single toolchain — `client/`'s React Testing Library setup needs Vitest
  anyway).

## Data model summary

| Entity | Key fields | Notes |
|---|---|---|
| Society | name, address, upiVpa, tenantRateFactor (default 1.5), defaultBaseRate (default 1500) | Root tenant entity. `upiVpa` required (Task 6.1 QR gen needs it); `tenantRateFactor` is the configurable rule-1 multiplier, not a hardcoded constant, admin-editable via `/api/admin/settings` (2026-08-06 addendum); `defaultBaseRate` only pre-fills new-flat onboarding, not consumed by any calculation |
| User | role (ADMIN/OWNER/TENANT), societyId | Auth identity |
| Flat | wing, flatNumber, baseRate, ownerId, currentTenantId | |
| OccupancyChange | flatId, tenantId, effective start/end | Drives rate calc |
| MaintenanceRecord | flatId, period, payerType, payerId, amount, dueDate | Monthly SYSTEM charge, always implicitly "Approved," never individually paid — permanently contributes `amount` to its flat's `totalCharges`. `payerId` is the specific User billed (resolved at generation time), not re-derived from `Flat.currentTenantId` later |
| LedgerEntry | type (DEPOSIT/CREDIT), flatId, payerId, amount, status, note, fileUrl, mimeType, adminNote, reviewedBy/At | Resident-created Deposit or Credit row (ledger pivot, 2026-08-06) — replaces PaymentProof. No link to specific MaintenanceRecords (payment is against the aggregate balance); only APPROVED rows count toward Outstanding/Credit balance/Payable. `fileUrl`/`mimeType` optional (proof no longer mandatory). See `docs/data-model.md` |
| NotificationLog | channel, recipient, status, linked entity | |
| AuditLog | actor, action, entity, timestamp, note | Financial action trail |

No `Invoice` entity (removed in the 2026-08-05 pivot) and no `PaymentProof` entity
(replaced by `LedgerEntry` in the 2026-08-06 ledger pivot, above). A resident's balance
is computed fresh from `MaintenanceRecord` + `LedgerEntry` every time, never stored as
a running total.

No schema changes are needed for resident self-service (Addition, 2026-08-06, above) —
`User.name`/`phone`/`email` and `Flat.currentTenantId`/`OccupancyChange` already model
everything required; only new route/controller/service logic is needed on top of the
existing schema.

## Non-functional requirements

- **Correctness over scale** — 24-flat MVP; do not over-engineer for multi-tenant scale,
  concurrency, or data volume.
- **Idempotency mandatory** for the monthly generation job — re-running for the same
  period must never duplicate records.
- **Financial data isolation** — proof files and billing data never accessible
  cross-society or to the wrong resident.
- **Auditability** — every state-changing financial action leaves an audit trail.
- **Low operating cost** — self-hosted VPS, no fixed third-party costs beyond email
  (free tier sufficient at this scale).

## Explicitly out of scope for this MVP (Phase 2+)

- Razorpay/payment gateway integration
- WhatsApp Business API / automated WhatsApp sending
- Complaints/helpdesk, notices/announcements, gate/visitor management modules
- Per-square-foot billing (flat-rate only)
- Facility booking, expense reports, polls, document vault
- Multi-society admin UX

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Frontend | React + Vite + TypeScript |
| Data fetching | React Query |
| Data tables | TanStack Table v8 (headless — `client/src/components/DataTable.tsx` is the one shared table shell every list view uses; `getCoreRowModel` only, no sorting/filtering/pagination row models, deliberately — this is a 24-flat MVP) |
| Forms/validation | React Hook Form + Zod |
| Auth | JWT (access + refresh), bcrypt |
| Scheduling | node-cron (in-process) |
| Email | Resend or SendGrid, behind a swappable `EmailProvider` interface |
| QR generation | `qrcode` npm package (no external API) |
| File upload parsing | `multer` (memory storage — buffers handed to the storage adapter, never written to disk by multer itself) |
| Proof storage | Swappable `StorageAdapter` interface (`server/src/lib/storage`) — `local` (disk, default) implemented; `s3`/`gdrive` are named extension points, not yet built. See `docs/payments.md` |
| Test runner | Vitest (backend and frontend) |
| Deployment | Docker Compose, Nginx reverse proxy, Certbot SSL |

## Delivery approach

- 11 phases (0–10), each broken into small, independently testable tasks.
- **TDD**: failing test first, confirm it fails, then minimal implementation to pass.
- Each task specifies a doc file under `docs/` to create or append to — these become the
  onboarding documentation as the project builds.
- Cross-cutting throughout: society-scoped data isolation enforced centrally (Task 2.6's
  shared middleware, re-audited in Task 9.1), Zod validation client + server, structured
  error handling with no leaked internals in production, audit logging for financial
  actions, server-side file upload validation.

## Repo layout (from Task 0.1/0.2 onward)

```
server/   Express + TypeScript backend
client/   React + Vite + TypeScript frontend
nginx/    reverse proxy config
docs/     living documentation, built up phase by phase
prisma/   schema, migrations, seed (inside server/)
```

## Backend architecture: route / controller / service, every endpoint (from Task 2.1)

```
server/src/
  routes/       *.route.ts      — HTTP wiring only: path + method → controller. No logic.
  controllers/  *.controller.ts — parses/validates the request (Zod schema lives here),
                                  calls the service, maps the result or a thrown domain
                                  error to an HTTP status + JSON body.
  services/     *.service.ts    — the actual business logic. Plain functions, no Express
                                  types (no req/res). Throws typed domain errors (e.g.
                                  DuplicateFieldError), not HTTP status codes — the
                                  controller decides what those mean over HTTP.
  lib/                          — small shared helpers used across services (e.g.
                                  prisma-errors.ts's P2002 → field-name extraction).
```

Adopted starting with Task 2.1, after Task 2.1 was first built as a single fat route
handler and then deliberately refactored into this shape. Why: Task 4.1/4.2 already
require the equivalent split independently (a "pure function" rate calculator, a "plain
function" generation job called from *both* a manual-trigger endpoint *and* a cron job)
— business logic that must be callable from more than one entry point can't live inside
a route handler. Applying the same split everywhere from Task 2.1 onward, rather than
only where the tracker explicitly forces it, keeps the codebase consistent and makes
every service unit-testable without HTTP (see
`server/tests/services/admin-users.service.test.ts` vs.
`server/tests/routes/admin-users.test.ts` for the same logic tested both ways).

**Gotcha discovered building this**: Prisma 7 + `@prisma/adapter-pg` does **not** use
the classic documented `err.meta.target: string[]` shape for P2002 (unique constraint)
errors. Confirmed empirically by triggering a real duplicate-key insert — the actual
field name is nested at `err.meta.driverAdapterError.cause.constraint.fields`.
`src/lib/prisma-errors.ts`'s `getUniqueConstraintFields()` checks that path first, falls
back to the classic shape. Any future service that needs to detect *which* field
violated a unique constraint should use this helper, not re-derive it.
