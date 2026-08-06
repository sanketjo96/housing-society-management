# Housing Society Management — MVP Requirements Document

Saved mirror of the original requirements doc (Google Doc, read 2026-08-05), which
remains the canonical original. **This document has been amended by the pivot
described in `CLAUDE.md`** (quarterly `Invoice` bundling dropped — `MaintenanceRecord`
is now the sole payable entity) — where this doc and `CLAUDE.md` disagree, `CLAUDE.md`
is authoritative for current behavior. This file is kept for full historical context.

**Purpose of this document**: this is the requirement-intake reference for Claude (or any engineer) starting work on this project. It consolidates the business context, rules, data model, and phased scope agreed for the MVP. Read this in full before beginning implementation — it is the source of truth CLAUDE.md and the task prompts are derived from.

-----
## 1. Project overview
A web application for a residential housing society's committee to manage flat onboarding, monthly maintenance accrual, quarterly invoicing, UPI-based payment collection with proof verification, and email notifications including overdue-dues escalation.

> **Amended by pivot**: "quarterly invoicing" — see `CLAUDE.md`. Maintenance records are now independently payable per month; there is no quarterly `Invoice` entity.

**Initial scale**: one society, approximately 24 flats. The system should be designed so a second society could be onboarded later without a schema rewrite, but multi-society UX (society switching, cross-society admin tools) is not required for this MVP.

**Deployment target**: a self-hosted VPS the owner already operates (7.6GB RAM, 55GB free disk confirmed sufficient), via Docker Compose.

-----
## 2. Personas
| **Persona** | **Description** | **Primary needs** |
| :- | :- | :- |
| **Admin** (committee member) | Manages the society — onboards flats, reviews payment proofs, monitors dues | Fast onboarding, clear dues visibility, low-friction proof review |
| **Owner** | Owns a flat, may or may not live in it | View own dues, pay via QR, upload proof |
| **Tenant** | Rents a flat from an owner | Same as owner, but billed at extra rate than owner while occupying |

-----
## 3. Core business rules (authoritative — do not deviate without confirming)

> **Amended by pivot** — rules 3, 4, 5, 6, 7, 8 below reflect the *original* design.
> See `CLAUDE.md`'s "Core business rules" and its pivot note for current behavior.

1.  **Rate logic**: an owner-occupied flat pays x the flat's base maintenance rate. A tenant-occupied flat pays 1.5x, billed to the tenant, not the owner. Have this factor configurable, could be 1.7x or 2x etc.
2.  **Occupancy is tracked historically**, not as a single current flag — because a flat's occupancy can change mid-quarter, and past billing periods must retain the rate that actually applied at the time.
3.  **Maintenance records are monthly, accrual-only, never independently payable.** One record is generated per flat per calendar month. It stores the rate/amount and payer type that applied for that specific month.
4.  **Invoices are quarterly and are the only payable entity.** Every 3 months, the system bundles the 3 most recent un-invoiced maintenance records for a flat into one invoice. The invoice total is the sum of those 3 records — not a flat multiplication — because the 3 months in a quarter may have different payer types/rates if occupancy changed.
5.  **Cadence**: exactly 12 maintenance records and 4 invoices per flat per year.
6.  **Payment is all-or-nothing per invoice.** No partial payments against a single invoice in this phase.
7.  **Payment method (this phase): UPI QR + manual proof verification.** No payment gateway (Razorpay etc.) is integrated in this phase — that is explicitly Phase 2. The flow is:
      - Resident views an unpaid invoice, sees a QR code encoding a UPI payment deep link with the amount and a reference pre-filled.
      - Resident pays via any UPI app, then uploads a screenshot/PDF as proof.
      - Invoice status becomes PENDING\_REVIEW.
      - Admin reviews the proof and either approves (invoice becomes PAID, cascading to the 3 linked maintenance records) or rejects (invoice reverts to UNPAID, resident notified with an optional reason and must re-upload).
      - Admin also has a manual "mark as paid" fallback for cash/bank-transfer edge cases, which must be logged distinctly in the audit trail.
8.  **Escalation**: if an invoice is unpaid past its due date plus a grace period (default 7 days, configurable), the flat is flagged. The system computes the total outstanding and prepares a message for the admin — who manually shares it to the resident WhatsApp group. The system does **not** auto-post to WhatsApp in this phase (see §7 for why).
9.  **Notifications are email-only in this phase.** WhatsApp Business API integration is deferred to Phase 2.

-----
## 4. Functional requirements by epic
### Epic 1 — Auth & Access Control
  - Admin-created accounts only (no public self-signup)
  - Login (email/phone + password), JWT access + refresh tokens, logout
  - Roles: ADMIN, OWNER, TENANT, enforced server-side
  - Society-scoped access on every request
  - Password reset flow

> **Amended (2026-08-06)**: see `CLAUDE.md`'s "Addition (2026-08-06)". A logged-in
> resident (OWNER/TENANT) may update their own name/phone/email directly — a narrower
> capability than "no public self-signup" above, which still holds (the account itself
> is still never opened to the public).

### Epic 2 — Flat & Society Onboarding
  - Society setup (name, address, block structure, UPI VPA for QR generation)
  - Create/edit flat (block, flat number, owner, base rate)
  - Bulk CSV import for flats
  - Assign/remove current tenant on a flat, with occupancy history tracked
  - Flat list view with owner/tenant/status

> **Amended (2026-08-06)**: see `CLAUDE.md`'s "Addition (2026-08-06)". Flat onboarding
> itself (create/edit flat, block/flat number/base rate) stays admin-only, unchanged.
> "Assign/remove current tenant" above is no longer admin-exclusive — an OWNER may now
> also create/update/remove their own flat's tenant from their own resident view; the
> admin-only path (Task 3.2) remains available alongside it.
### Epic 3 — Maintenance Records (monthly accrual)
  - Monthly generation job (idempotent), rate computed per the occupancy that applied in that specific month
  - Resident view: 12 records/year
  - Admin view: all records, filterable
### Epic 4 — Invoices (quarterly billing)
> Amended by pivot — see `CLAUDE.md`. No `Invoice` entity; `MaintenanceRecord` is independently payable.
  - Quarterly generation job (idempotent), bundling 3 records into 1 invoice
  - Resident view: 4 invoices/year with monthly breakdown visible
  - Admin view: all invoices, dues summary per flat
### Epic 5 — QR Payment & Proof Verification
  - UPI QR generation per invoice (local generation, no external API)
  - Resident proof upload (image/PDF, validated type and size)
  - Secure, authenticated-only proof file access (never public)
  - Admin review queue with approve/reject actions
  - Approve cascades to invoice + linked records; reject reverts and notifies
  - Manual mark-as-paid fallback, audit-logged
### Epic 6 — Notifications (email only)
  - Invoice-generated reminder
  - Proof-submitted admin alert
  - Proof approved/rejected resident alert
  - Notification delivery logging
  - Escalation detection and admin-facing flagged list
### Epic 7 — Admin Dashboard
  - Society-wide outstanding total and collection rate
  - Flat-wise dues table
  - Pending proofs widget
  - Flagged/escalated flats widget
### Cross-cutting requirements
  - Multi-tenant data isolation (society\_id scoping enforced centrally)
  - Input validation (Zod, client and server)
  - Structured error handling, no internals leaked in production
  - Audit logging for financial actions
  - File upload validation enforced server-side

-----
## 5. Data model summary

> **Amended by pivot** — this table reflects the *original* design. See
> `CLAUDE.md`'s "Data model summary" and `docs/data-model.md` for current schema.

| **Entity** | **Key fields** | **Notes** |
| :- | :- | :- |
| Society | name, address | Root tenant entity |
| User | role (ADMIN/OWNER/TENANT), societyId | Auth identity |
| Flat | block, flatNumber, baseRate, ownerId, currentTenantId | |
| OccupancyChange | flatId, tenantId, effective start/end | Historical occupancy, drives rate calc |
| MaintenanceRecord | flatId, period, payerType, amount, invoiceId (nullable) | Monthly, accrual-only |
| Invoice | flatId, quarter, totalAmount, status, dueDate | Quarterly, the only payable entity |
| PaymentProof | invoiceId, uploadedBy, fileUrl, status, adminNote, reviewedBy/At | |
| NotificationLog | channel, recipient, status, linked entity | |
| AuditLog | actor, action, entity, timestamp, note | Financial action trail |

Relationship: 3 MaintenanceRecord rows link to 1 Invoice via invoiceId. Invoice status cascades down to its linked records on payment.

-----
## 6. Non-functional requirements
  - **Correctness over scale** — this is a 24-flat MVP; do not over-engineer for multi-tenant scale, high concurrency, or large data volumes.
  - **Idempotency** is mandatory for both the monthly and quarterly generation jobs — re-running for the same period/quarter must never duplicate records or invoices.
  - **Financial data isolation** — payment proof files and billing data must never be accessible cross-society or to the wrong resident.
  - **Auditability** — every state-changing financial action (invoice generation, manual paid-marking, proof approval/rejection) must leave an audit trail.
  - **Low operating cost** — designed to run on infrastructure the owner already has (self-hosted VPS), with no fixed third-party costs in this phase beyond email delivery (free tier sufficient at this scale).

-----
## 7. Explicitly out of scope for this MVP (Phase 2 or later)
  - Razorpay or any payment gateway integration (automated capture, webhooks)
  - WhatsApp Business API integration / any automated WhatsApp sending — deferred due to compliance risk: Meta's official API cannot post into an existing resident-created group, and unofficial clients risk number bans
  - Complaints/helpdesk module
  - Notices/announcements module
  - Gate/visitor management module
  - Per-square-foot billing (flat-rate only in this phase)
  - Facility booking, expense reports, polls, document vault
  - Multi-society admin UX (society switcher, cross-society reporting)

-----
## 8. Technology decisions
| **Layer** | **Choice** |
| :- | :- |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Frontend | React + Vite + TypeScript |
| Data fetching | React Query |
| Forms/validation | React Hook Form + Zod |
| Auth | JWT (access + refresh), bcrypt |
| Scheduling | node-cron (in-process) |
| Email | Resend or SendGrid (implemented behind a swappable interface) |
| QR generation | qrcode npm package (no external API) |
| Deployment | Docker Compose on existing VPS, Nginx reverse proxy, Certbot SSL |

-----
## 9. Delivery approach
Development proceeds in 11 phases (0–10), each broken into small, independently testable tasks following a test-driven approach (failing test first, then implementation). Each phase produces its own section of running documentation (data model, billing logic, auth, payments, notifications, admin dashboard, architecture, deployment) intended for onboarding a new engineer. See the accompanying task tracker (**`task-prompts-v1`** — supersedes the original `task-prompts` referenced here) for the full phase-by-phase task breakdown, and CLAUDE.md for the persistent project rules to keep in context throughout implementation.

-----
## 10. Open questions / assumptions to confirm before or during build

> All resolved — see `CLAUDE.md`'s "Confirmed decisions".

  - Default invoice due date is generation date + 15 days — confirm this matches the society's actual expectation. **Resolved: confirmed, now applies to MaintenanceRecord's dueDate post-pivot.**
  - Default escalation grace period is 7 days past due date — confirm. **Resolved: confirmed.**
  - Mid-month tenant transitions: confirm the exact rule for which rate applies in the transition month itself (e.g. prorate, or whichever occupancy status was active for the majority of the month) — this must be decided explicitly in Task 4.1, not left ambiguous. **Resolved: majority-of-days wins, ties go to the status active on the last day of the month.**
  - UPI VPA (payment address) for QR generation is assumed to be configured once per society — confirm who owns/manages this account. **Resolved: `Society.upiVpa`, required field (added during Phase 1 review after being missed in the initial schema).**
