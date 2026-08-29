# 0007 — Complaints brought back into scope

**Status**: Accepted, not yet built

## Context

`CLAUDE.md`'s "Do not touch / out of scope" list originally excluded
"Complaints/helpdesk" alongside notices/announcements and gate/visitor
management, as part of keeping this app's early scope tight. A concrete
requirement has since arrived (GitHub issue #1) for an owner-only
complaint log with admin-moderated status and community upvoting —
narrower than a full helpdesk: no tenant access, no notifications, one
optional image, no ticketing/SLA/assignment machinery.

## Decision

Reverse the exclusion for Complaints only. Notices/announcements and
gate/visitor management remain explicitly out of scope, unchanged. See
`docs/features/complaints/` for the full design (designed, not yet
built).

## Consequences

- `CLAUDE.md`'s out-of-scope bullet is edited to drop "Complaints/
  helpdesk" and keep the other two items verbatim.
- This is scoped deliberately narrow (owner-only, no notifications, one
  image, admin-controlled status). A future request to add tenant access,
  notifications, or broader helpdesk machinery (SLAs, categories,
  assignment) is a new scope decision, not an extension of this one.
