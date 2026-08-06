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

**What stays admin-only, unchanged**: `block`, `flatNumber`, and `baseRate` are set at
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
residents" tab): the real admin flat-onboarding workflow is **one form** — block,
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
  2026-08-06, above) — but not the flat's admin-set fields (block, flat number, base
  rate), which stay read-only from the resident side.
- **Tenant**: rents from an owner. Same as owner, but billed at a higher rate while
  occupying. May also update their own contact details.

## Core business rules (authoritative — do not deviate without confirming)

1. **Rate logic**: owner-occupied flat pays 1x base rate. Tenant-occupied flat pays 1.5x
   (configurable factor), billed to the tenant, not the owner.
2. **Occupancy is tracked historically** via `OccupancyChange`, not a single current flag
   — a flat's occupancy can change mid-quarter and past billing periods must retain the
   rate that actually applied at the time.
3. **Maintenance records are monthly and independently payable.** One record per flat
   per calendar month, storing the rate/amount/payer type for that month. Payable
   immediately once generated — `status` starts `UNPAID` with a `dueDate` set at
   generation time (§ Pivot above).
4. **A resident's "outstanding balance" is the live sum of their unpaid records** —
   however many months are currently unpaid, no quarterly grouping. There is no
   separate bundling entity.
5. **Cadence**: exactly 12 maintenance records per flat per year (one per month).
6. **Payment is all-or-nothing per record, but selection-based across records.** No
   record is ever partially paid. A resident may select any combination of their
   currently-unpaid records to settle in one payment; on approval, every selected
   record flips to `PAID` together in one transaction — no partial-cascade state.
   Unselected records are untouched and remain outstanding.
7. **Payment method (this phase): UPI QR + manual proof verification.** No payment
   gateway integration (that's Phase 2, out of scope here). Flow:
   - Resident views outstanding balance (all unpaid records) → selects any subset to
     pay → sees a QR encoding a UPI deep link for the sum of the selection.
   - Resident pays via any UPI app, uploads screenshot/PDF as proof — one proof, linked
     to all selected records (many-to-many).
   - Every selected record's status → `PENDING_REVIEW`.
   - Admin approves (→ all selected records `PAID`, one transaction) or rejects (→ all
     selected records revert to `UNPAID`, resident notified with optional reason, must
     re-upload).
   - Admin manual "mark as paid" fallback for cash/bank-transfer (accepts a list of
     records), logged distinctly in the audit trail (separate from QR-flow approvals).
8. **Escalation**: a maintenance record unpaid past due date + grace period → flat
   flagged. System computes outstanding total (across all that flat's unpaid records)
   and prepares a message; admin manually shares it (no auto-post to WhatsApp — see
   out-of-scope list, compliance risk).
9. **Notifications are email-only this phase.** WhatsApp Business API is Phase 2.
10. **Resident self-service** (added 2026-08-06): an `OWNER`/`TENANT` may update their
    own `name`/`phone`/`email` without admin involvement; an `OWNER` may additionally
    create/update/remove their own flat's `TENANT`. Does not extend to admin-set flat
    fields (`block`/`flatNumber`/`baseRate`) or to creating new `Flat` rows — see the
    "Addition (2026-08-06)" section above for the full mechanism and reasoning.

### Confirmed decisions (resolved during requirements intake, 2026-08-05)

- **Mid-month occupancy transition rate** (Task 4.1): for a flat's month, sum days under
  each occupancy status (OWNER vs TENANT). Whichever status has more days sets the rate
  for the *entire* month's single MaintenanceRecord. **On an exact tie** (only possible
  in 28- or 30-day months), **the status active on the last day of the month wins.**
  Example: owner-occupied Aug 1–10, tenant Aug 11–31 → tenant has majority (21 vs 10
  days) → whole month billed at tenant rate.
- **MaintenanceRecord due date**: generation date + 15 days (was "Invoice due date"
  pre-pivot — same default value, now attached to the record itself).
- **Escalation grace period**: 7 days past due date (configurable).
- **Test runner**: Vitest for both `server/` and `client/` (Task 0.1 leaves this open;
  chosen for a single toolchain — `client/`'s React Testing Library setup needs Vitest
  anyway).

## Data model summary

| Entity | Key fields | Notes |
|---|---|---|
| Society | name, address, upiVpa, tenantRateFactor (default 1.5) | Root tenant entity. `upiVpa` required (Task 6.1 QR gen needs it); `tenantRateFactor` is the configurable rule-1 multiplier, not a hardcoded constant |
| User | role (ADMIN/OWNER/TENANT), societyId | Auth identity |
| Flat | block, flatNumber, baseRate, ownerId, currentTenantId | |
| OccupancyChange | flatId, tenantId, effective start/end | Drives rate calc |
| MaintenanceRecord | flatId, period, payerType, payerId, amount, status, dueDate | Monthly, independently payable — the sole payable entity. `payerId` is the specific User billed (resolved at generation time), not re-derived from `Flat.currentTenantId` later |
| PaymentProof | uploadedBy, fileUrl, status, adminNote, reviewedBy/At | Many-to-many with MaintenanceRecord — one proof can cover several selected records |
| NotificationLog | channel, recipient, status, linked entity | |
| AuditLog | actor, action, entity, timestamp, note | Financial action trail |

No `Invoice` entity (removed in the pivot). A `PaymentProof` can link to any number of
`MaintenanceRecord`s a resident selected for one payment; approval cascades `PAID` to
all of them together, in one transaction.

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
| Forms/validation | React Hook Form + Zod |
| Auth | JWT (access + refresh), bcrypt |
| Scheduling | node-cron (in-process) |
| Email | Resend or SendGrid, behind a swappable `EmailProvider` interface |
| QR generation | `qrcode` npm package (no external API) |
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
