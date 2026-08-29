# Complaints — Requirements

## Context
- App: Society management system (24 flats, 3 personas — Admin, Owner,
  Tenant).
- Owners have no in-app way to report a maintenance/facility issue (a
  leaky pipe, a broken common-area light, a security lapse) or see what
  others have already reported — today this happens informally, over the
  society WhatsApp group or a verbal word to a committee member.
- Admin has no dashboard signal of how many issues are open, or which ones
  the community actually cares about.
- Source: [GitHub issue #1](https://github.com/sanketjo96/housing-society-management/issues/1),
  "Complaints Feature — Requirements."

## Problem Statement
Owners need a structured way to log an issue with a suggested fix and a
priority, browse the shared backlog of every complaint raised in the
society (not just their own), and signal which issues matter most via
upvotes. Admin needs a single admin-controlled status pipeline plus a
moderation lever for bad-faith or duplicate reports — without adding a new
notification channel to maintain, and without opening this feature into a
full helpdesk (ticketing, SLAs, assignment) that nobody asked for.

## Confirmed Product Decisions
These were explicitly settled during design discussion and should not be
re-litigated without a new conversation:

1. **Owner-only, end to end.** Tenants cannot log, view, or upvote
   complaints — there is no tenant-facing route or UI surface for this
   feature at all, not a filtered/read-only view. Every backend route
   gates on `Role === 'OWNER'` (or `'ADMIN'` for the one admin-only
   endpoint), using the same `requireRole()` middleware every other
   role-gated feature already uses — no new access-control mechanism.
2. **Shared, society-wide visibility — split across two surfaces, not one
   list.** ~~Every owner sees every complaint... not filtered to "my
   complaints" by default~~ — **superseded (2026-08-29):** the shared,
   ranked, upvotable view of every complaint in the society lives on the
   Owner/Resident Dashboard's "Community Complaints" table; the dedicated
   `/complaints` page is each owner's own management view (create, edit,
   delete, track status), filtered to `owner.id === caller.id`. The
   backend's `GET /api/complaints` is unchanged (still society-wide,
   ranked by upvote count) — filtering to "my own" happens client-side on
   `/complaints` only, so Admin's complaint-management page
   (`/admin/complaints`) is unaffected. Self-upvoting one's own complaint
   from `/complaints` is still possible (Decision #3) even though the
   primary place to browse and upvote others' complaints is the
   Dashboard.
3. **Self-upvoting is allowed, and upvoting is a toggle.** An owner may
   upvote their own complaint, and may remove (un-toggle) their upvote on
   any complaint at any time.
4. **Upvote count is always derived, never stored.** Computed at read time
   from `ComplaintUpvote` rows (`prisma.complaintUpvote.count(...)`) —
   there is no `upvoteCount` column on `Complaint`. This follows the same
   convention `CLAUDE.md` already states for billing balances: "derived,
   never stored."
5. **Status is entirely admin-controlled and freely reversible.** Admin
   may move a complaint to Open, In Progress, Resolved, or Rejected at any
   time, in any direction (including back to Open from Resolved) — there
   is no enforced state machine restricting which transitions are legal.
6. **Rejected is the only moderation tool.** Admin never edits or deletes
   an owner's complaint title, possible solution, or image. A duplicate or
   spam complaint is moved to Rejected, not altered or removed.
7. **The owner's edit/delete window is narrow, and re-checked live.** An
   owner may edit or delete their own complaint only while
   `status === OPEN` and the upvote count is zero. This is a **stateless,
   live re-check** on every request — not a one-way permanent lock. The
   instant either condition is no longer true (an upvote lands, or admin
   changes status away from Open), edit/delete is blocked; if the
   condition later reverts (the sole upvote is removed, or admin reverts
   status to Open), the owner's edit/delete rights come back automatically,
   with no separate "unlock" action needed. This check is enforced
   server-side, inside the same transaction as the write — never trusted
   from an earlier UI-side read — to close the race between an incoming
   upvote and an in-flight edit/delete request.
8. **One optional image, attached only at creation.** No multi-image
   support, no separate attachments model — a single opaque-key image
   column on `Complaint`, served only through an authenticated route
   (never a public URL), per `docs/features/file-storage.md`'s
   `StorageAdapter` contract.
9. **No notifications.** Purely an in-app dashboard signal on both the
   Admin Dashboard and the Owner/Resident Dashboard — no hook into the
   existing Email/WhatsApp notification pipeline.
10. **Admin dashboard shows summary cards with counts; the Owner/Resident
    dashboard shows the full ranked list.** These are deliberately
    different views, not the same widget reused twice: Admin gets
    count-style cards (open count, and a count per status) for an
    at-a-glance signal; the Owner/Resident dashboard shows every complaint
    in the society, sorted by upvote count descending, as the actual
    browse-and-upvote surface.
11. **Every state-changing action is audit-logged.** Create, edit,
    delete-while-unlocked, and admin status changes each write an
    `AuditLog` row (`entityType: 'Complaint'`) inside the same
    `prisma.$transaction` as the mutation — follows `other-charges.
    service.ts`'s pattern, not Vehicle Finder's (which explicitly opted
    out of audit logging by product decision).

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | An owner can log a complaint with Title, Possible Solution, and Priority (Low/Medium/High), plus an optional image | Must |
| R2 | A logged complaint is automatically tied to the logging owner and their flat — not free text the owner types in | Must |
| R3 | Every owner in the society can view a shared, ranked list of every complaint (not just their own) on the Owner/Resident Dashboard, showing who raised it, which flat, priority, status, and upvote count | Must |
| R3a | The dedicated `/complaints` page shows only the caller's own complaints (create/edit/delete/status-tracking view) — superseded 2026-08-29, see Confirmed Product Decision #2 | Must |
| R4 | Any owner can upvote any complaint, including their own | Must |
| R5 | An owner can remove (toggle off) their own upvote on any complaint | Must |
| R6 | The complaint list can be ranked/sorted by upvote count | Must |
| R7 | Admin can change a complaint's status to any of Open / In Progress / Resolved / Rejected, at any time, in any direction | Must |
| R8 | The owner who logged a complaint can edit it (Title, Possible Solution, Priority, image) only while status is Open and upvote count is zero | Must |
| R9 | The owner who logged a complaint can delete it only under the same condition as R8 | Must |
| R10 | R8/R9 eligibility is a live re-check, enforced server-side at the moment of the request (not cached, not UI-only) — edit/delete rights return automatically if the condition reverts | Must |
| R11 | Admin dashboard shows complaint summary cards: total open count, and a count per status | Must |
| R12 | Owner/Resident dashboard shows the full list of all complaints in the society, sorted by upvote count descending | Must |
| R13 | The optional complaint image is served only via an authenticated endpoint, never a public URL | Must |
| R14 | Tenants receive a 403 (backend) and see no nav entry or UI surface (frontend) for every complaints route | Must |
| R15 | Every create, edit, delete, and admin status-change action writes an `AuditLog` row | Should |

## Non-Functional Requirements
- **Low operating cost**: reuses the existing `StorageAdapter` (local disk
  or R2) for the optional image — no new storage integration.
- **Never a stored counter**: upvote count is computed fresh on every
  read, avoiding drift between a cached count and the underlying rows —
  same rationale this app already applies to balances.
- **Race-safety over UI-only enforcement**: the edit/delete lock (R10)
  must hold under concurrent requests — checked inside the mutating
  transaction, not pre-checked in the UI and trusted.
- **Correctness over scale**: 24-flat MVP — no pagination or indexing
  strategy beyond `@@index([societyId])`, the same baseline every other
  feature uses.

## Explicitly Out of Scope (v1)
- **Email/WhatsApp notifications** for any complaint event — see
  [`05-future-scope.md`](./05-future-scope.md) item 1.
- **Multiple images or non-image attachments** per complaint — see
  future-scope item 2.
- **Tenant involvement of any kind** — see future-scope item 3.
- **Comments or threaded discussion** on a complaint — see future-scope
  item 4.
- ~~A "my complaints only" filtered view~~ — **built 2026-08-29**: this is
  now the entire purpose of the dedicated `/complaints` page (see
  Confirmed Product Decision #2). Future-scope item 5 is resolved, not
  deferred.
- **Admin editing complaint content** — Rejected is the only moderation
  lever (Confirmed Product Decision #6); this is a deliberate exclusion,
  not a deferral.
- This feature must not be read as a foothold into **notices/
  announcements** or **gate/visitor management** — both remain explicitly
  out of scope for this app; see `CLAUDE.md` and
  [`docs/decisions/0007-complaints-back-in-scope.md`](../../decisions/0007-complaints-back-in-scope.md).

## Success Criteria
- An owner can log a complaint with an optional photo in under a minute,
  and see it appear immediately in the shared list.
- Any owner can upvote or un-upvote any complaint, and the list can
  surface the most-upvoted issues first.
- Admin can move a complaint through Open → In Progress → Resolved (or
  Rejected) at will, and both dashboards reflect current state on normal
  React Query refetch, with no manual refresh trigger needed.
- An owner's edit/delete controls disappear the moment their complaint
  gets its first upvote or admin changes its status away from Open, and
  reappear automatically if that condition reverts.
