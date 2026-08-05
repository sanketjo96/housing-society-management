# CLAUDE.md — Housing Society Management (MVP)

Persistent project rules. Read in full before starting any task. Source of truth for
business rules is `docs/requirements.md` (mirrors the original requirements doc); this
file exists to keep the rules and confirmed decisions in context during implementation.
The phase/task breakdown lives in the task tracker (task-prompts) — 11 phases (0–10),
51 tasks — and is authoritative for what to build next and in what order.

## Project overview

Web app for a single residential housing society's committee: flat onboarding, monthly
maintenance accrual, quarterly invoicing, UPI-based payment collection with manual proof
verification, and email notifications including overdue-dues escalation.

- Initial scale: one society, ~24 flats. Schema must not require a rewrite to onboard a
  second society later, but multi-society UX (society switching, cross-society admin) is
  explicitly out of scope for this MVP.
- Deployment target: self-hosted VPS (7.6GB RAM, 55GB disk), via Docker Compose.

## Personas

- **Admin** (committee member): onboards flats, reviews payment proofs, monitors dues.
- **Owner**: owns a flat, may or may not live in it. Views own dues, pays via QR.
- **Tenant**: rents from an owner. Same as owner, but billed at a higher rate while
  occupying.

## Core business rules (authoritative — do not deviate without confirming)

1. **Rate logic**: owner-occupied flat pays 1x base rate. Tenant-occupied flat pays 1.5x
   (configurable factor), billed to the tenant, not the owner.
2. **Occupancy is tracked historically** via `OccupancyChange`, not a single current flag
   — a flat's occupancy can change mid-quarter and past billing periods must retain the
   rate that actually applied at the time.
3. **Maintenance records are monthly, accrual-only, never independently payable.** One
   record per flat per calendar month, storing the rate/amount/payer type for that month.
4. **Invoices are quarterly and the only payable entity.** Every 3 months, bundle the 3
   most recent un-invoiced maintenance records for a flat into one invoice. Total = sum
   of those 3 records (not a flat multiplication), since payer type may differ per month
   within the quarter.
5. **Cadence**: exactly 12 maintenance records and 4 invoices per flat per year.
6. **Payment is all-or-nothing per invoice.** No partial payments in this phase.
7. **Payment method (this phase): UPI QR + manual proof verification.** No payment
   gateway integration (that's Phase 2, out of scope here). Flow:
   - Resident views unpaid invoice → sees QR encoding a UPI deep link (amount + reference
     pre-filled).
   - Resident pays via any UPI app, uploads screenshot/PDF as proof.
   - Invoice status → `PENDING_REVIEW`.
   - Admin approves (→ `PAID`, cascades to all 3 linked maintenance records, one
     transaction) or rejects (→ reverts to `UNPAID`, resident notified with optional
     reason, must re-upload).
   - Admin manual "mark as paid" fallback for cash/bank-transfer, logged distinctly in
     the audit trail (separate from QR-flow approvals).
8. **Escalation**: invoice unpaid past due date + grace period → flat flagged. System
   computes outstanding total and prepares a message; admin manually shares it (no
   auto-post to WhatsApp — see out-of-scope list, compliance risk).
9. **Notifications are email-only this phase.** WhatsApp Business API is Phase 2.

### Confirmed decisions (resolved during requirements intake, 2026-08-05)

- **Mid-month occupancy transition rate** (Task 4.1): for a flat's month, sum days under
  each occupancy status (OWNER vs TENANT). Whichever status has more days sets the rate
  for the *entire* month's single MaintenanceRecord. **On an exact tie** (only possible
  in 28- or 30-day months), **the status active on the last day of the month wins.**
  Example: owner-occupied Aug 1–10, tenant Aug 11–31 → tenant has majority (21 vs 10
  days) → whole month billed at tenant rate.
- **Invoice due date**: generation date + 15 days.
- **Escalation grace period**: 7 days past due date (configurable).
- **Test runner**: Vitest for both `server/` and `client/` (Task 0.1 leaves this open;
  chosen for a single toolchain — `client/`'s React Testing Library setup needs Vitest
  anyway).

## Data model summary

| Entity | Key fields | Notes |
|---|---|---|
| Society | name, address | Root tenant entity |
| User | role (ADMIN/OWNER/TENANT), societyId | Auth identity |
| Flat | block, flatNumber, baseRate, ownerId, currentTenantId | |
| OccupancyChange | flatId, tenantId, effective start/end | Drives rate calc |
| MaintenanceRecord | flatId, period, payerType, amount, invoiceId (nullable) | Monthly |
| Invoice | flatId, quarter, totalAmount, status, dueDate | Quarterly, only payable entity |
| PaymentProof | invoiceId, uploadedBy, fileUrl, status, adminNote, reviewedBy/At | |
| NotificationLog | channel, recipient, status, linked entity | |
| AuditLog | actor, action, entity, timestamp, note | Financial action trail |

3 MaintenanceRecord rows link to 1 Invoice via `invoiceId`. Invoice status cascades to
linked records on payment.

## Non-functional requirements

- **Correctness over scale** — 24-flat MVP; do not over-engineer for multi-tenant scale,
  concurrency, or data volume.
- **Idempotency mandatory** for monthly and quarterly generation jobs — re-running for
  the same period/quarter must never duplicate records or invoices.
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
