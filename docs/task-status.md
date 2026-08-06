# Task status

Mirrors **`task-prompts-v1`** (supersedes the original `task-prompts` — see `CLAUDE.md`'s
pivot note: quarterly `Invoice` bundling dropped, `MaintenanceRecord` is now the sole
payable entity). Updated as each task completes — this file, not the Google Sheet, is
the source of truth for build progress since it lives in git.

## Phase 0 — Project scaffolding & Docker infra

- [x] 0.1 Initialize backend project
- [x] 0.2 Initialize frontend project
- [x] 0.3 Add Prisma and connect to Postgres
- [x] 0.4 Docker Compose service definitions
- [x] 0.5 Nginx reverse proxy config
- [x] 0.6 Health check endpoint

## Phase 1 — Data model / schema

- [x] 1.1 Society and User models
- [x] 1.2 Flat and OccupancyChange models
- [x] 1.3 MaintenanceRecord model (reworked post-pivot — no Invoice; status + dueDate added)
- [x] 1.4 PaymentProof, NotificationLog, AuditLog models (PaymentProof now many-to-many with MaintenanceRecord)
- [x] 1.5 Seed script

## Phase 2 — Auth & Access Control

- [x] 2.1 Admin-created user endpoint
- [x] 2.2 Login and JWT issuance
- [x] 2.3 Refresh token and logout
- [x] 2.4 Password reset flow
- [x] 2.5 Role-guard middleware
- [x] 2.6 Tenant-scoping middleware
- [x] 2.7 Frontend login page
- [x] 2.8 Protected routes and auth context

## Phase 3 — Flat & Society Onboarding

- [x] 3.1 Create/edit flat endpoints (redesigned 2026-08-06 — owner/tenant are
      find-or-create contact fields, not pre-existing ids; see `docs/flats.md`'s
      "Redesign" section, confirmed against the admin-view UI mockup)
- [x] 3.2 Assign/remove tenant endpoint (id-based, still admin-only; kept alongside
      3.1's redesign as a lower-level alternative — `docs/flats.md`)
- [x] 3.3 List flats endpoint
- [x] 3.4 CSV bulk import for flats (redesigned alongside 3.1 — same inline
      owner/tenant contact fields as the form, not a pre-existing-owner lookup)
- [x] 3.5 Frontend onboard-flat form
- [x] 3.6 Frontend flat list and tenant assignment UI (3.5+3.6 merged into one page,
      `FlatsListPage.tsx`, matching the admin mockup's list ↔ inline-form pattern —
      `docs/flats.md`)

> **3.7/3.8 added 2026-08-06, not in the original `task-prompts-v1` breakdown** — see
> `CLAUDE.md`'s "Addition (2026-08-06)". Confirmed against a shared resident-view UI
> mockup (`ResidentExperience`'s "My details" tab): an owner manages their own contact
> details and their flat's tenant directly, without going through the admin-only
> endpoints above (3.1/3.2 stay admin-only and remain available for admin-initiated
> corrections).

- [x] 3.7 Resident self-service endpoints — `PATCH /api/me` (own profile, any role) +
      `GET/PUT/DELETE /api/me/flat(/tenant)` (`OWNER`/`TENANT`, `docs/auth.md`)
- [x] 3.8 Frontend "My details" tab (resident view) — `MyDetailsPage.tsx`

Phase 3 complete (3.1–3.8).

## Phase 4 — Maintenance Records (monthly, independently payable)

- [x] 4.1 Rate calculation function (`src/lib/rate-calculation.ts`, pure function —
      generalized to tenant-to-tenant turnover, see `CLAUDE.md`'s confirmed decisions)
- [x] 4.2 Monthly record generation logic (idempotent — `@@unique([flatId, period])` +
      `createMany({ skipDuplicates: true })`, sets status=UNPAID + dueDate)
- [x] 4.3 Manual trigger endpoint for record generation (`POST
      /api/admin/maintenance-records/generate`)
- [x] 4.4 Monthly cron wiring (`node-cron`, 00:05 on the 1st, `Asia/Kolkata`)
- [x] 4.5 Resident maintenance records endpoint (`GET /api/me/maintenance-records`,
      the resident's primary outstanding-balance view)
- [x] 4.6 Admin maintenance records endpoint (`GET /api/admin/maintenance-records`,
      filterable — absorbed dues-summary from removed 5.5)
- [x] 4.7 Frontend resident maintenance page (`MaintenancePage.tsx`, new "Passbook"
      tab) — read-only for now; the "primary payment entry point" framing becomes
      literal once Task 6.8's selection/QR/payment UI lands on top of this same page

## Phase 5 — [DISSOLVED] Quarterly invoicing

Superseded by the pivot — `MaintenanceRecord` is independently payable, no quarterly
bundling. All 7 tasks removed; remaining useful concerns folded into Phase 4 (dues
summary → 4.6) and Phase 8 (dues overview UI → already covered by 8.1/8.2).

- [x] ~~5.1 Quarterly invoice generation logic~~ REMOVED
- [x] ~~5.2 Manual trigger endpoint for invoice generation~~ REMOVED
- [x] ~~5.3 Quarterly cron wiring~~ REMOVED
- [x] ~~5.4 Resident invoices endpoint~~ REMOVED — superseded by 4.5
- [x] ~~5.5 Admin invoices and dues summary endpoint~~ REMOVED — merged into 4.6
- [x] ~~5.6 Frontend resident invoices page~~ REMOVED — superseded by 4.7
- [x] ~~5.7 Frontend admin dues overview~~ REMOVED — redundant with 8.1/8.2

## Phase 6 — QR Payment & Proof Verification (now selection-based across records)

- [ ] 6.1 UPI QR generation endpoint (accepts selected maintenanceRecordIds, not one invoiceId)
- [ ] 6.2 Payment proof upload endpoint (one proof, many selected records)
- [ ] 6.3 Authenticated proof view/download endpoint
- [ ] 6.4 Admin pending proofs list endpoint
- [ ] 6.5 Approve proof endpoint (cascades N records, not fixed 3)
- [ ] 6.6 Reject proof endpoint (reverts N records)
- [ ] 6.7 Manual mark-as-paid fallback (accepts a list of record IDs)
- [ ] 6.8 Frontend outstanding-balance selection & payment UI (was: invoice QR/upload UI)
- [ ] 6.9 Frontend admin proof review queue

## Phase 7 — Notifications (email only)

- [ ] 7.1 EmailProvider interface and implementation
- [ ] 7.2 Maintenance-record-generated notification (was: invoice-generated)
- [ ] 7.3 Proof-submitted admin notification
- [ ] 7.4 Proof approved/rejected resident notification
- [ ] 7.5 Notification logging
- [ ] 7.6 Escalation job (invoices → MaintenanceRecords)

## Phase 8 — Admin Dashboard

- [ ] 8.1 Outstanding total and collection rate widget (base logic now from 4.6, not removed 5.5)
- [ ] 8.2 Flat-wise dues table (base logic now from 4.6, not removed 5.5)
- [ ] 8.3 Pending proofs widget
- [ ] 8.4 Flagged flats widget

## Phase 9 — Security & Hardening Audit

- [ ] 9.1 Society-scoping audit (module list: no more "invoices")
- [ ] 9.2 Rate limiting on auth endpoints
- [ ] 9.3 Consistent error handling
- [ ] 9.4 AuditLog verification (reference Tasks 4.2, 6.5, 6.6, 6.7 — not removed 5.1)
- [ ] 9.5 File upload validation re-check

## Phase 10 — Production Deployment

- [ ] 10.1 Production-ready Docker Compose
- [ ] 10.2 DEPLOY.md and Certbot SSL
