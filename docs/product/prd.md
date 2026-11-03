# Saral Society — Product Requirements Document

| | |
|---|---|
| Product | Saral Society (repo: `housing-society-management`) |
| Owner | Sanket Joshi |
| Status | Draft v1.1, 2026-11-03 (§11 items 1–4 settled) |
| Clickable demo | `demo/index.html` on branch `demo/clickable-mockup-stage-1` |

This PRD describes the **whole product**: what is already built in this repo
and what the full platform will add. It is the product-level "what and
why". For how a built feature works, the feature docs in
[`docs/features/`](../features/_index.md) are authoritative, and `CLAUDE.md`
holds the engineering rules. Where this PRD and a feature doc disagree about
built behaviour, the feature doc wins and the disagreement is listed in
[§11 Decisions to reconcile](#11-decisions-to-reconcile).

---

## 1. Summary

Saral Society is billing and day-to-day management software for small Indian
housing societies (co-operative housing societies and RWAs) of 10–150 flats.
It replaces the committee's spreadsheet, WhatsApp group and receipt book with
one passbook per flat: monthly maintenance is charged automatically,
residents pay by UPI and upload proof, the treasurer approves, and a CHS
format receipt goes out on WhatsApp and email.

The first customer is the author's own 24-flat society. The product is then
offered to other small societies that find MyGate, NoBrokerHood and ADDA too
expensive or too heavy for what they need.

## 2. Problem

Small societies run on volunteer committees. Today a treasurer typically:

- keeps dues in a spreadsheet and chases each flat on WhatsApp;
- matches UPI screenshots against the bank statement by hand;
- writes receipts in a carbon receipt book, or not at all;
- has no clean income and expenditure record when the annual audit comes;
- handles tenant-occupied flats (often charged a higher rate) from memory.

Existing apps are built for large gated communities. They charge per flat
per year (MyGate quoted about ₹14,500/year for a 24-flat society), bundle
visitor management the society may not need, and don't produce the receipts
and registers a Maharashtra CHS audit expects.

## 3. Goals and non-goals

**Goals**

1. A treasurer can run monthly collection end to end in under 30 minutes a
   month for a 24-flat society.
2. Every rupee received has a sequential, gap-free receipt in CHS format.
3. Every flat's balance is explainable from its passbook rows alone.
4. Residents can pay and get a receipt without calling anyone.
5. Running cost stays near zero for the society (self-hosted, free tiers,
   prepaid WhatsApp credits only).

**Non-goals (for now)**

- Payment gateway integration. UPI deep link or QR plus manual proof
  verification only.
- Public self-signup. Accounts are always created by the society admin.
- Large-community features: vendor marketplace, rewards, polls and voting,
  document vault (see §10 Future scope).
- iOS apps. Android only for the native apps.

## 4. Users and personas

| Persona | Who | Primary surface | Core jobs |
|---|---|---|---|
| **Admin** | Committee member, usually Treasurer or Secretary | Web app (desktop first, responsive) | Onboard flats, set rates, review payments, issue receipts, record expenses, keep residents informed |
| **Owner** | Flat owner, may or may not live there | Web app now, Android resident app later | See dues, pay, get receipts, keep own and tenant details current |
| **Tenant** | Occupant of a rented flat | Same as Owner | Same as Owner for maintenance; billed at the tenant rate while occupying |
| **Guard** | Security guard at the main gate | Android guard app (later phase) | Verify gate passes, log walk-in visitors, mark exits |
| **Platform operator** | Sanket, as vendor | Server and scripts | Onboard a new society, bulk-import its history, deploy |

Owner and tenant of the same flat see **one shared passbook** for that flat.

## 5. Product principles

- **Passbook, not invoices.** Each flat has one ledger of rows. Balances and
  settlement status are always derived from the rows, never stored.
- **Nothing counts until approved.** A resident's payment affects the
  balance only after the admin approves it.
- **Stored amounts are final.** A charge keeps the rate in force when it was
  generated. A receipt is rendered once at approval and stored; it is never
  recomputed from current settings.
- **Admin does what the committee owns; residents do what they own.** Admin
  edits owner and flat details; occupancy and tenant details belong to the
  owner.
- **Never lose a message.** If WhatsApp credits run out, messages queue and
  go out after the next top-up.
- **Correctness over scale.** Built for a 24-flat society first; the schema
  supports more societies, the UX does not need to yet.

## 6. Scope by phase

| Phase | Name | Platform | Contents | Status |
|---|---|---|---|---|
| 1 | Billing core | Web | Flats and residents, maintenance billing, payments and collections, receipts, committee signatures, admin dashboard | Built |
| 2 | Operations layer | Web | Society income and expenses, other charges, complaints, notices, amenity booking, notifications | Partly built (see §7 status column) |
| 3 | Guard app | Android | Guard login, visitor entry with photo, gate pass verification (QR or code), visitor log | Not built; shown in demo |
| 4 | Resident app | Android | Passbook, pay, receipts, complaints, notices, amenity booking, gate pass creation, push notifications, PIN or biometric unlock, Play Store release | Not built; shown in demo |

Gate pass creation lives in the resident app and verification in the guard
app, which is why the guard app ships first (Phase 3) and the resident app
after it (Phase 4).

## 7. Functional requirements

Status key: **Built** = live in this repo · **Designed** = feature doc
exists, not built · **New** = not yet designed in this repo (demo only).

### 7.1 Accounts and access — Built

- Email and password login; JWT access and refresh tokens; password reset by
  email. Login and reset are rate-limited.
- Roles: `ADMIN`, `OWNER`, `TENANT`. No public signup.
- Every query is scoped to the caller's society.
- Committee roles (Chairman, Secretary, Treasurer) are separate from the
  login role and drive receipt signatures.

Details: [`auth.md`](../features/auth.md),
[`committee-and-signatures.md`](../features/committee-and-signatures.md).

### 7.2 Flats and residents — Built

- Admin creates and edits a flat: wing, flat number, owner name, email,
  phone. Bulk CSV import with a validation summary before anything is saved.
- Admin **cannot** edit occupancy or tenant details; these are view-only
  for the admin.
- Owner or tenant edits, from "My details": owner contact details,
  occupancy (owner-occupied or rented), tenant details. Wing, flat number
  and rate are locked for residents.
- Every occupancy change is recorded with an effective date, because the
  monthly rate depends on who occupied the flat that month.
- Residents can register vehicles; any role can look up a plate number
  (Vehicle Finder).
- *(New)* Export of the flats directory to Excel.

Details: [`flats-and-residents.md`](../features/flats-and-residents.md),
[`vehicle-finder/`](../features/vehicle-finder/).

### 7.3 Maintenance billing — Built

- Settings: default base rate per flat per month and a tenant multiplier
  (tenant rate = base rate × multiplier).
- A monthly job adds one maintenance charge per flat. It bills the
  previous, fully elapsed month (arrears billing), choosing owner or tenant
  rate by majority of days occupied.
- The job is idempotent: running it again for the same month never creates
  duplicates. It can also be triggered manually by the admin.
- Each charge stores its amount; later rate changes never alter it.

Details: [`maintenance-records.md`](../features/maintenance-records.md).

### 7.4 Passbook and balances — Built

- One ledger per flat: system charges (always approved) and resident
  deposits (pending, approved or rejected).
- Derived figures, recomputed on every read:
  - Outstanding = max(0, total charges − approved deposits)
  - Available credit = max(0, approved deposits − total charges)
- Each monthly charge shows a derived settlement status (unpaid, partially
  settled, paid) by filling the oldest charges first.
- Passbook columns: date, payer, type, amount, status. Owner and tenant of
  a flat see the same passbook.

Details: [`payments.md`](../features/payments.md),
[decision 0002](../decisions/0002-balance-based-ledger.md).

### 7.5 Payments and collections — Built

- A resident can pay **any amount above zero**, not only the full payable.
  Paying more than Outstanding leaves the excess as available credit. There
  is no separate credit claim; an expense a resident paid on the society's
  behalf is submitted as a deposit flagged "expense to settle against
  maintenance" (decided 2026-11-03, §11).
- Resident starts a payment, which creates a **payment intent**. The amount
  is locked when the intent is created, and the intent stays open until
  proof is submitted or the resident cancels it. One open intent per
  resident at a time.
- On a phone the resident pays through a UPI deep link. On desktop the page
  shows a UPI QR; the resident pays from their phone and uploads the
  screenshot on desktop. Bank transfer details are the fallback when no UPI
  ID is configured.
- Resident uploads the proof (image or PDF, type checked by file content)
  and can mark a payment as an expense they paid on the society's behalf,
  to be settled against maintenance.
- Admin review queue: proof preview, approve or reject. Reject requires a
  reason the resident sees. Approve requires the bank reference and first
  shows the receipt for checking.
- Manual entry for cash, cheque or NEFT received at the office, audit
  logged.
- Proof files are only reachable by the flat's residents and the admin of
  that society.

Details: [`payments.md`](../features/payments.md),
[`bank-reference/`](../features/bank-reference/).

### 7.6 Receipts — Built

- Clicking Approve opens a receipt preview: Cancel, or Confirm & approve.
- Receipt numbers are sequential and gap-free per society, issued by the
  backend at approval.
- Fixed CHS receipt format: society name, address and registration number,
  receipt number, book number, date, received-from, flat, amount in figures
  and words, mode and reference, particulars, footer note, two signatures.
- Amounts come from the stored amount on each approved row, never
  recomputed from current settings.
- The receipt is rendered to PDF once at approval and stored; it is sent to
  the payer and can be resent. A Receipt Book register lists all receipts.
- Settings page: receipt template fields are editable; registered name,
  address, account number and book number are read-only; signature upload
  per committee member.

Details: [`receipts.md`](../features/receipts.md).

### 7.7 Admin dashboard — Built

- Summary cards: total outstanding, collection rate, pending-review total.
- Flat-wise dues table: sortable and filterable.
- Flagged or escalated flats past the grace period.
- *(New)* Export of the dues table to Excel.
- *(New)* Resident adoption: last login per flat (needs a `lastLoginAt`
  field; see §9 Monitoring).

Details: [`admin-dashboard.md`](../features/admin-dashboard.md).

### 7.8 Other charges — Built

- Configurable catalogue of one-off fee types (joining fee, transfer fee,
  fine). Billed to one flat's owner at a time.
- Separate outstanding figure, book and pay flow from maintenance; uses the
  same admin review queue.

Details: [`other-charges/`](../features/other-charges/).

### 7.9 Society income and expenses — Built

- Society-level ledger of income and expenses, separate from resident
  billing: date, category, paid to, mode, amount, bill attachment.
- Income and expenditure view for the audit. Formal audit-ready exports
  (see §10) are future scope.

Details: [`manage-finance/`](../features/manage-finance/).

### 7.10 Society onboarding — Built

- Platform-level bootstrap of a new society and its first admin.
- Bulk import of a client's historical arrears, charges and finance data.

Details: [`society-onboarding/`](../features/society-onboarding/).

### 7.11 Notifications — Partly built

- One event-driven pipeline for Email and WhatsApp. Events: monthly bill
  generated, payment approved (with receipt), payment rejected. Later:
  overdue reminder, notice published, complaint update, booking decision.
- Email (Resend) is live. WhatsApp (Meta Cloud API, Utility templates) is
  built but switched off until a permanent token and template approval are
  in place.
- WhatsApp opt-in is recorded per resident.
- **Credits (New):** the society buys prepaid WhatsApp credit packs
  through a payment link; one message to one recipient uses one credit.
  Credits are tracked as a ledger (purchase, consume, refund) with the
  balance derived. A credit is consumed atomically with the send and
  refunded if delivery fails. If the balance is empty, messages pause in a
  queue and are never dropped. Sending is paced to stay under Meta rate
  limits.
- Admin view: credit balance, automatic message toggles, template preview,
  delivery log.

Details: [`notifications/`](../features/notifications/).

### 7.12 Complaints — Designed, with 2026-11-03 changes

Designed in this repo, with two product changes decided on 2026-11-03
(§11). The feature docs in `complaints/` still describe the earlier
owner-only, no-notification design and must be updated before building.

- **Owners and tenants** can log a complaint with title, possible solution
  and one optional image. *(Changed: was owner-only.)*
- Society-wide ranked list on the resident dashboard; owners and tenants
  can upvote, including their own, as a toggle.
- Admin moves status freely between Open, In Progress, Resolved and
  Rejected. Rejected is the only moderation tool.
- The resident who raised it may edit or delete it only while Open with
  zero upvotes.
- **Assignee** *(new)*: admin can record who is handling it (a vendor or a
  committee member) and add an update note the resident can see.
- **Notifications** *(new)*: the resident who raised the complaint is told
  on WhatsApp and email when its status changes or an update note is
  added, through the existing notification pipeline (`COMPLAINT_UPDATED`,
  `COMPLAINT_RESOLVED` events). Each WhatsApp message uses one credit.
- Not audit-logged (complaints are not financial; see
  [decision 0008](../decisions/0008-complaints-not-audit-logged.md)).

Details: [`complaints/`](../features/complaints/),
[decision 0007](../decisions/0007-complaints-back-in-scope.md).

### 7.13 Notices — New

- Admin publishes a notice: title, message, audience (everyone, owners,
  tenants), optional pin to top, optional WhatsApp send (shows credits
  needed before sending).
- Residents see notices on their home screen with unread markers; read
  count shown to the admin.

### 7.14 Amenity booking — New

- Admin configures amenities: name, capacity, hours, fee per slot.
- Resident requests a slot. A slot already taken cannot be requested.
- Admin confirms or declines with a reason. Any fee is added to the flat's
  passbook as a charge.

### 7.15 Gate passes and visitor management — New (Phases 3–4)

Resident app:

- Create a gate pass: type (guest, delivery, cab, service), visitor name,
  optional phone, date, time window. The pass gets a 6-digit code and a QR.
- Share the pass to the visitor; cancel it any time before use.

Guard app:

- Verify by scanning the QR or typing the code. Clear outcome: valid (show
  visitor, flat, window, created by) or don't let in, with the reason
  (unknown code, already used, cancelled, wrong date). A pass works once.
- Walk-in entry: photo, name, flat, purpose, optional vehicle number. The
  flat's residents get an Allow / Deny prompt in the app; the guard can
  also record an approval given on a phone call.
- Visitor log with entry and exit times; mark exit.
- Flats directory with resident phone numbers for calling.
- Admin sees the full visitor log.

### 7.16 Native apps — New (Phases 3–4)

- Android only, built from the same backend API.
- Resident app covers the resident web features plus push notifications,
  PIN or biometric unlock and Play Store release.
- Guard app runs on a shared gate phone with a guard login.

## 8. Roles and permissions

| Action | Admin | Owner | Tenant | Guard |
|---|---|---|---|---|
| Edit owner contact details | ✓ | ✓ (own flat) | ✓ (own flat) | |
| Edit wing / flat number | ✓ | | | |
| Edit occupancy and tenant details | view only | ✓ | ✓ | |
| Set base rate and tenant multiplier | ✓ | | | |
| See flat passbook | all flats | own flat | own flat | |
| Pay / upload proof | manual entry | ✓ | ✓ | |
| Approve or reject payments | ✓ | | | |
| Edit receipt template and signatures | ✓ | | | |
| Record society expenses | ✓ | | | |
| Bill other charges | ✓ | | | |
| Raise or upvote complaint | | ✓ | ✓ | |
| Assign and update complaint | ✓ | | | |
| Publish notices | ✓ | | | |
| Request amenity booking | | ✓ | ✓ | |
| Create gate pass | | ✓ | ✓ | |
| Verify pass / log visitors | view log | | | ✓ |

## 9. Non-functional requirements

- **Security and isolation:** every query scoped by society; proof files,
  receipts and signatures served only through authenticated routes; upload
  type checked by content; rate limiting on login and password reset; no
  stack traces in production responses.
- **Audit:** every state-changing financial action writes an audit log
  entry with a distinct action name.
- **Monitoring (required):** error tracking (self-hosted GlitchTip with the
  Sentry SDK) on backend and frontend; structured logging (pino, built);
  product analytics (self-hosted Umami with custom events for pay, approve,
  login); per-flat last login for the adoption widget. Only logging is
  built today; the rest is New.
- **Performance:** pages usable on a mid-range Android phone on 4G; the
  24-flat scale needs no caching layer.
- **Availability and backup:** single VPS via Docker Compose; weekly
  database backup to a separate R2 bucket (built).
- **Cost:** no fixed third-party costs beyond email and R2's free tier;
  WhatsApp costs covered by prepaid credits the society buys.
- **Documents:** PDFs rendered by a document service behind
  `renderDocument(templateId, data) → PDF` (Puppeteer + Handlebars,
  templates as data, one reused browser), so it can move to its own service
  later.
- **Localisation:** English UI, Indian number and currency formatting
  (₹1,00,000), dates as DD Mon YYYY. Marathi and Hindi are future scope.
- **Accessibility:** keyboard reachable controls, visible focus,
  sufficient contrast in light and dark themes.

## 10. Future scope

Explicitly out of the four phases above:

- CHS audit-ready export pack: member register, receipt register,
  income and expenditure, receipts and payments, balance sheet, defaulters
  list in the formats auditors expect under the MCS Act.
- Polls and §79A-compliant digital voting for redevelopment decisions.
- Document vault (bye-laws, minutes, NOCs).
- Rewards for on-time payment.
- Vendor marketplace and vendor logins.
- Custom receipt templates per society (MVP ships one fixed CHS format).
- OCR-assisted bank reference capture beyond what is built.
- iOS apps; Marathi and Hindi UI.
- Multi-society admin UX (switching between societies in one session).

## 11. Decisions between the demo and the built app

The clickable demo was built from sales discussions and differed from the
built app in several places.

### Settled (2026-11-03)

| # | Topic | Decision | Follow-up |
|---|---|---|---|
| 1 | Credit as a row type | Keep the built model: no Credit type ([0003](../decisions/0003-credit-lifecycle.md)). Overpaying a deposit creates available credit; a reimbursable expense is a deposit flagged "expense to settle". | Restyle the demo's "Add credit" as a flagged deposit |
| 2 | Pay amount | Any amount above zero, as built. No full-payable-only restriction. | Update the demo's pay sheet to allow editing the amount |
| 3 | Complaints for tenants | Tenants can raise and upvote complaints, same as owners. | Update `complaints/01-requirements.md` (Decision 1) and add a decision record superseding owner-only |
| 4 | Complaint notifications and assignee | In scope: assignee field, resident-visible update notes, WhatsApp and email on status change. | Update `complaints/01-requirements.md` (Decision 9) and the notification event list |

### Still open

| # | Topic | Built app / `CLAUDE.md` | Demo / sales discussion | Proposed |
|---|---|---|---|---|
| 5 | Notices, amenity booking, gate passes, visitors | Listed as out of scope in `CLAUDE.md` | Shown as Phase 2–4 features | If the client buys them, update `CLAUDE.md` "Do not touch" and add a decision record before building |
| 6 | Payment link for WhatsApp credit packs | `CLAUDE.md` rules out payment gateways (meant for resident payments) | Credit packs bought through a payment link | Allow a payment link for the society's own credit purchases only; record as a decision |

## 12. Success metrics

- Collection rate: share of the month's billed amount collected within 30
  days (target 90% by the third month of use).
- Median time from proof upload to approval (target under 24 hours).
- Resident adoption: flats with a login in the last 30 days (target 80%).
- Treasurer time per month on collections (target under 30 minutes for 24
  flats).
- Receipt coverage: approved payments with a receipt (target 100%).
- WhatsApp delivery rate and credits per flat per month.

## 13. Open questions

1. Which payment link provider for WhatsApp credit packs (Razorpay Payment
   Links assumed).
2. Overdue rules: grace period length, reminder cadence, whether a late fee
   is ever charged.
3. Amenity fees: charged on confirmation or after use; refund on
   cancellation.
4. Gate pass for daily staff (maids, cooks): recurring passes, or a staff
   register maintained by the admin.
5. Guard app device: one shared phone per gate, or the guard's own phone.
6. Who in the committee can approve payments when the treasurer is away.
7. Pricing and packaging for societies beyond the first (per flat per year
   vs. flat tiers).
