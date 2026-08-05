# Task status

Mirrors the task tracker (task-prompts). Updated as each task completes — this file,
not the Google Sheet, is the source of truth for build progress since it lives in git.

## Phase 0 — Project scaffolding & Docker infra

- [x] 0.1 Initialize backend project
- [x] 0.2 Initialize frontend project
- [x] 0.3 Add Prisma and connect to Postgres
- [x] 0.4 Docker Compose service definitions
- [x] 0.5 Nginx reverse proxy config
- [x] 0.6 Health check endpoint

## Phase 1 — Data model / schema

- [ ] 1.1 Society and User models
- [ ] 1.2 Flat and OccupancyChange models
- [ ] 1.3 MaintenanceRecord and Invoice models
- [ ] 1.4 PaymentProof, NotificationLog, AuditLog models
- [ ] 1.5 Seed script

## Phase 2 — Auth & Access Control

- [ ] 2.1 Admin-created user endpoint
- [ ] 2.2 Login and JWT issuance
- [ ] 2.3 Refresh token and logout
- [ ] 2.4 Password reset flow
- [ ] 2.5 Role-guard middleware
- [ ] 2.6 Tenant-scoping middleware
- [ ] 2.7 Frontend login page
- [ ] 2.8 Protected routes and auth context

## Phase 3 — Flat & Society Onboarding

- [ ] 3.1 Create/edit flat endpoints
- [ ] 3.2 Assign/remove tenant endpoint
- [ ] 3.3 List flats endpoint
- [ ] 3.4 CSV bulk import for flats
- [ ] 3.5 Frontend onboard-flat form
- [ ] 3.6 Frontend flat list and tenant assignment UI

## Phase 4 — Maintenance Records (monthly accrual)

- [ ] 4.1 Rate calculation function
- [ ] 4.2 Monthly record generation logic
- [ ] 4.3 Manual trigger endpoint for record generation
- [ ] 4.4 Monthly cron wiring
- [ ] 4.5 Resident maintenance records endpoint
- [ ] 4.6 Admin maintenance records endpoint
- [ ] 4.7 Frontend resident maintenance page

## Phase 5 — Invoices (quarterly billing)

- [ ] 5.1 Quarterly invoice generation logic
- [ ] 5.2 Manual trigger endpoint for invoice generation
- [ ] 5.3 Quarterly cron wiring
- [ ] 5.4 Resident invoices endpoint
- [ ] 5.5 Admin invoices and dues summary endpoint
- [ ] 5.6 Frontend resident invoices page
- [ ] 5.7 Frontend admin dues overview

## Phase 6 — QR Payment & Proof Verification

- [ ] 6.1 UPI QR generation endpoint
- [ ] 6.2 Payment proof upload endpoint
- [ ] 6.3 Authenticated proof view/download endpoint
- [ ] 6.4 Admin pending proofs list endpoint
- [ ] 6.5 Approve proof endpoint
- [ ] 6.6 Reject proof endpoint
- [ ] 6.7 Manual mark-as-paid fallback
- [ ] 6.8 Frontend invoice QR and upload UI
- [ ] 6.9 Frontend admin proof review queue

## Phase 7 — Notifications (email only)

- [ ] 7.1 EmailProvider interface and implementation
- [ ] 7.2 Invoice-generated notification
- [ ] 7.3 Proof-submitted admin notification
- [ ] 7.4 Proof approved/rejected resident notification
- [ ] 7.5 Notification logging
- [ ] 7.6 Escalation job

## Phase 8 — Admin Dashboard

- [ ] 8.1 Outstanding total and collection rate widget
- [ ] 8.2 Flat-wise dues table
- [ ] 8.3 Pending proofs widget
- [ ] 8.4 Flagged flats widget

## Phase 9 — Security & Hardening Audit

- [ ] 9.1 Society-scoping audit
- [ ] 9.2 Rate limiting on auth endpoints
- [ ] 9.3 Consistent error handling
- [ ] 9.4 AuditLog verification
- [ ] 9.5 File upload validation re-check

## Phase 10 — Production Deployment

- [ ] 10.1 Production-ready Docker Compose
- [ ] 10.2 DEPLOY.md and Certbot SSL
