# Complaints — Future Scope

Everything below is **deliberately not built in v1**. Documented so the
path is clear if a real need appears — not so it gets scheduled
prematurely. Re-read [`01-requirements.md`](./01-requirements.md) before
starting any item here to confirm the trigger is real, not anticipated.

## 1. Email/WhatsApp Notifications on Complaint Events
**What**: notify the owner when their complaint's status changes, or
notify admin when a new complaint is logged, via the existing
notification pipeline.
**Trigger**: owners report missing status updates because they forget to
check the dashboard.
**Why not now**: explicitly declined for v1 — in-app dashboard signal
only (Confirmed Product Decision #9).
**Cost to add**: small-to-moderate — the pipeline already exists
(`docs/features/notifications/`); this just needs new event types wired
into it, following the same pattern `other-charges/`'s
`OtherChargeBilledEvent` used.

## 2. Multiple / Non-Image Attachments
**What**: more than one photo, or PDF/video attachments per complaint.
**Trigger**: owners report one photo is insufficient to document an
issue.
**Why not now**: adds storage/UI complexity with no evidenced need yet;
confirmed as a single optional image in design (Confirmed Product
Decision #8).
**Cost to add**: moderate — would need a join-table model, unlike today's
inline `imageFileKey`/`imageMimeType` columns.

## 3. Tenant Involvement
**What**: allow tenants to log, view, or upvote complaints.
**Trigger**: only if tenant involvement is explicitly brought back into
scope at the product level.
**Why not now**: explicitly owner-only per the issue and Confirmed
Product Decision #1.
**Cost to add**: large — a new persona-facing surface end to end (routes,
UI, nav), not a small extension of the existing owner routes.

## 4. Comments / Discussion Thread per Complaint
**What**: owners or admin add follow-up comments on a complaint.
**Trigger**: real friction where upvote-only signal isn't expressive
enough to communicate context or progress.
**Why not now**: not requested; would add a new model and its own
moderation surface.
**Cost to add**: moderate — a `ComplaintComment` model plus its own
create/list/delete endpoints and UI.

## 5. "My Complaints" Filtered View — RESOLVED (2026-08-29)
Built, not deferred. The dedicated `/complaints` page now filters
client-side to `owner.id === caller.id` — it's each owner's own
create/edit/delete/status-tracking view. The shared, ranked, upvotable
view of every complaint in the society moved to the Owner/Resident
Dashboard's "Community Complaints" table instead. See
[`01-requirements.md`](./01-requirements.md) Confirmed Product Decision
#2. `GET /api/complaints` itself is unchanged (still society-wide) — the
filter is purely client-side on this one page, so `/admin/complaints`
and the dashboard are unaffected.

## Guiding Rule for All of the Above
Don't build any item in this document until the specific trigger listed
next to it has actually happened. If a trigger does occur, re-confirm the
exact shape with the user before implementing — several items here
(especially 1 and 3) interact with already-confirmed v1 scope decisions
and shouldn't be assumed to still hold their original boundaries without a
fresh check.
