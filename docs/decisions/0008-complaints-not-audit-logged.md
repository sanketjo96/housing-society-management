# 0008 — Complaints are not audit-logged

**Status**: Accepted

## Context

The original complaints design (`docs/features/complaints/01-requirements.md`
Confirmed Product Decision #11, R15) had every create, edit, delete, and
admin status-change write an `AuditLog` row, following
`other-charges.service.ts`'s pattern rather than Vehicle Finder's (which
had already opted out). This was built as part of the initial complaints
rollout.

On review, this doesn't match `CLAUDE.md`'s stated audit-logging scope:
"Audit logging for every state-changing financial action." Complaints
aren't financial — there's no money, balance, or payment state involved —
so logging them was scope creep from the `other-charges.service.ts`
precedent, not a deliberate extension of the audit-logging policy.

## Decision

Remove `AuditLog` writes from all complaint mutations: `createComplaint`,
`updateComplaint`, `deleteComplaint` (resident), and
`changeComplaintStatus` (admin). Audit logging stays reserved for
financial state-changing actions only, as `CLAUDE.md` already states.

## Consequences

- `resident-complaints.service.ts` and `admin-complaints.service.ts` no
  longer write `AuditLog` rows. `createComplaint` no longer needs a
  `prisma.$transaction` wrapper (it was only ever bundling the complaint
  write with the audit-log write). `changeComplaintStatus` drops its
  `actorId` parameter, since it was only used for the removed audit-log
  entry.
- `updateComplaint` and `deleteComplaint` keep their `$transaction`
  wrapper — that's for the live lock re-check race, unrelated to audit
  logging.
- `docs/features/complaints/01-requirements.md` (Confirmed Product
  Decision #11, R15) and `02-architecture.md` are updated to reflect this
  as current-state, not history — this file is where the "why" lives.
- Any future request to audit-log a non-financial entity should be
  weighed against this same scope boundary, not treated as precedent from
  `other-charges.service.ts`.
