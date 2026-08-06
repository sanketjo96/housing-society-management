# Admin Dashboard — Phase 8

Reference for the admin-only dashboard: society-wide summary, flat-wise dues, pending
proofs shortcut, and the overdue-flat escalation widget (rule 8). Same route/prefix
convention as `docs/auth.md`/`docs/payments.md` — every path below is mounted under
`/api/`. All four endpoints/widgets are `ADMIN`-only (`requireRole(['ADMIN'])`) and
scoped to the caller's own society throughout — no query here ever reads across
societies.

## Pure logic — `src/lib/escalation.ts`

Same pure-function-first pattern as `calculateMonthlyRate` (Phase 4): the "is this flat
overdue, and what should the reminder say" logic is unit-tested independently of the DB,
then consumed by the service layer.

- `isOverdue(dueDate, gracePeriodDays, now)` — `true` once `now` is past `dueDate +
  gracePeriodDays`. `DEFAULT_GRACE_PERIOD_DAYS = 7`, matching CLAUDE.md's confirmed
  default.
- `buildEscalationMessage(input)` — formats the admin-facing reminder text (recipient
  name, flat wing-flatNumber, outstanding total, oldest due date). Rule 8 is explicit
  that this message is *prepared*, not sent — "admin manually shares it (no auto-post to
  WhatsApp — compliance risk)" — so this only ever produces text for a human to copy.

## `getDashboardSummary(societyId)` — `GET /api/admin/dashboard/summary`

Task 8.1. Response: `{ totalBilled, totalPaid, outstandingTotal, pendingReviewTotal,
collectionRatePercent }`, computed across every `MaintenanceRecord` in the society
(all periods, not just the current one — there's no quarterly/monthly window concept
post-pivot).

- `totalBilled` = sum of every record's `amount`, any status.
- `totalPaid` = sum of `PAID` records only.
- `outstandingTotal` = sum of strictly `UNPAID` records — **`PENDING_REVIEW` is broken
  out separately** (`pendingReviewTotal`), not folded into "outstanding," since a
  resident has already paid and is waiting on admin review, a materially different
  state from "hasn't paid yet."
- `collectionRatePercent` = `round(totalPaid / totalBilled * 100)`, `0` when
  `totalBilled` is `0` (no records generated yet — avoids a `0/0` `NaN`).

## `getFlatWiseDues(societyId)` — `GET /api/admin/dashboard/flat-dues`

Task 8.2. Response: one row per flat, **including flats with zero dues** — an admin
scanning the table needs to see "this flat is fully settled" as a positive absence of
debt, not have the flat silently missing. Each row: `{ flat: {id, wing, flatNumber},
owner, currentTenant, outstandingTotal, unpaidCount }`.

- `outstandingTotal`/`unpaidCount` sum `UNPAID` **and** `PENDING_REVIEW` records
  together — from a "how much does this flat still owe or have in flight" view, both
  are money not yet fully collected, unlike the summary widget's split (which exists to
  answer "how much is truly outstanding" vs. "how much is proof-pending").
- Sorted `outstandingTotal` descending, so the admin's highest-priority flats surface
  first without any client-side sorting needed (`DataTable` has no sort model, per
  CLAUDE.md's tech-stack table — deliberately minimal for a 24-flat MVP).
- Reuses `listFlats` (already-scoped, already-tested from Task 3.x) for the flat/
  owner/tenant shape rather than re-deriving it.

## `getFlaggedFlats(societyId, gracePeriodDays?)` — `GET /api/admin/dashboard/flagged-flats`

Task 8.4 (rule 8's escalation widget). Response: one row per flat with **at least one**
`UNPAID` record past `dueDate + gracePeriodDays`: `{ flat, recipient, outstandingTotal,
oldestDueDate, overdueRecordCount, message }`.

- **`gracePeriodDays` is the "configurable" knob from rule 8** — exposed as an optional
  query param (`?gracePeriodDays=N`, positive integer, `zod`-validated, `400` on a
  non-numeric value) rather than a new persisted `Society` setting. A query param
  already satisfies "configurable" for an admin re-checking the list with a different
  threshold, without an unrequested schema/Settings-tab change — if a persisted default
  is ever wanted, `Society.escalationGraceDays` would be the natural extension, mirroring
  how `Society.tenantRateFactor` was added for rule 1.
- **`outstandingTotal` is the flat's full unpaid total, not just the overdue portion** —
  rule 8's exact wording: "computes outstanding total (across all that flat's unpaid
  records)." A flat with one 30-day-overdue record and one 2-day-old record still shows
  its combined total, so the admin's reminder (and the resident's actual balance) isn't
  understated.
- **`recipient` is `flat.currentTenant ?? flat.owner`** — never a stale historical payer
  re-derived from an old record's `payerId`. Matches rule 1: a tenant-occupied flat's
  bills go to the tenant, so that's who the reminder addresses, even if the overdue
  record itself predates the current tenant.
- `message` is `buildEscalationMessage`'s output, ready to copy-paste as-is (e.g. into
  WhatsApp manually, or email) — the endpoint returns it, it never sends anything.

## Pending proofs widget — Task 8.3

No new backend endpoint — the frontend widget reuses the existing
`GET /api/admin/payment-proofs?status=PENDING` (Task 6.4) and shows the count, with a
click-through to the already-built "Payment proofs" tab. Building a second endpoint
just to return a count that endpoint's response length already gives for free would
have duplicated Task 6.4's query for no benefit at this scale (24 flats — no pagination
to work around).

## Frontend — `client/src/pages/admin/AdminDashboardPage.tsx`

Renders on the existing "Dashboard" tab (`DashboardPage.tsx`) for `role === 'ADMIN'`
only — residents keep seeing the existing placeholder, unchanged. Four independent
`useQuery` calls (summary, flat-dues, flagged-flats, pending-proofs count); a combined
loading/error state covers all four rather than four separate spinners, since this is
one screen an admin reads as a whole.

- **Summary cards** — outstanding total, collection rate, pending-review total.
- **Pending proofs button** — count + "Review →", `onNavigateToProofs` switches the
  parent's tab state to `'payment-proofs'` (no route change, matching the rest of this
  app's tab-based navigation).
- **Flagged flats table** (`DataTable`, only rendered when non-empty) — flat, recipient,
  overdue-since date, outstanding total, and a **"Copy message" button** per row
  (`CopyMessageButton`, small independently-stateful component owning its own "Copied"
  confirmation, same per-cell-state pattern as `PaymentProofsPage`'s `ProofFileCell`/
  `ProofActionsCell`) that puts `message` on the clipboard via
  `navigator.clipboard.writeText` — the "admin manually shares it" step from rule 8.
- **Flat-wise dues table** (`DataTable`, always rendered, including ₹0 rows) — flat,
  owner, tenant, outstanding, unpaid count.

**Test gotcha worth recording**: `@testing-library/user-event`'s `userEvent.setup()`
unconditionally installs its own `navigator.clipboard` stub
(`attachClipboardStubToView`, called from `setup.js`), **overwriting** any
pre-existing `navigator.clipboard` mock set in a test's `beforeEach` — `beforeEach` runs
before the test body, and `userEvent.setup()` is called inside the test body, so the
stub always wins. `AdminDashboardPage.test.tsx`'s copy-message test therefore calls
`userEvent.setup()` **first**, then `vi.spyOn(navigator.clipboard, 'writeText')`
*after*, spying on the stub's own method rather than pre-defining the property.

## Manually verified against the real running stack

```sh
# Admin summary, against the real seeded "Sunrise Residency" data
curl http://localhost:3000/api/admin/dashboard/summary -H "Authorization: Bearer <adminToken>"
# → 200, { totalBilled: 64900, totalPaid: 57050, outstandingTotal: 7850,
#          pendingReviewTotal: 0, collectionRatePercent: 88 }

# Flat-wise dues — 5 flats, sorted highest-outstanding-first
curl http://localhost:3000/api/admin/dashboard/flat-dues -H "Authorization: Bearer <adminToken>"
# → 200, [{ flat: {wing:"B",flatNumber:"201"}, outstandingTotal: 2700, unpaidCount: 1, ... }, ...]

# Flagged flats — none of the seeded demo data is currently past the 7-day default grace period
curl http://localhost:3000/api/admin/dashboard/flagged-flats -H "Authorization: Bearer <adminToken>"
# → 200, []

# gracePeriodDays override and validation
curl "http://localhost:3000/api/admin/dashboard/flagged-flats?gracePeriodDays=1" -H "Authorization: Bearer <adminToken>"
# → 200, [] (still none within 1 day of due date at the seed data's current dates)
curl "http://localhost:3000/api/admin/dashboard/flagged-flats?gracePeriodDays=abc" -H "Authorization: Bearer <adminToken>"
# → 400, { error: "Invalid input", ... }

# Non-admin rejected
curl http://localhost:3000/api/admin/dashboard/summary -H "Authorization: Bearer <ownerToken>"
# → 403

# Frontend: confirmed nginx is serving the newly built bundle (asset hash changed post-rebuild)
curl http://localhost/ | grep -o 'assets/index-[^"]*\.js'
```

Read-only against the real seeded data throughout — no throwaway records were created,
so no cleanup was needed.
