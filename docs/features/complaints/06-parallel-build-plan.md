# Complaints — Parallel Build Plan

## Purpose
When this feature is actually implemented, several of its pieces can be
built by separate agents (or separate people) working at the same time,
as long as each one owns a mutually exclusive set of files. This doc
defines that split so parallel work doesn't collide on the same file, and
states the one sequential gate everything else depends on. It maps
directly onto the epics in
[`03-scope-and-task-breakdown.md`](./03-scope-and-task-breakdown.md).

## Sequential Gate
Must complete first, one agent at a time — every other workstream imports
from these:

| Covers | Files |
|---|---|
| Epic 1 — Schema | `server/prisma/schema.prisma`, the new `add_complaints` migration folder |
| Epic 2 — Shared lock logic | `server/src/shared/complaints/complaint-lock.ts` + its unit test |

## Parallel Workstreams
Start only after the gate closes. Each workstream writes its own tests
for the files it owns — there is deliberately no separate cross-cutting
"testing agent," since that would touch every other workstream's files
and defeat the mutual-exclusivity goal.

| Workstream | Owns these files | Depends on | Must not touch |
|---|---|---|---|
| **W1 — Backend Resident module** | `server/src/features/complaints/resident/**` (create, list, edit, delete, upvote, unvote, image route) + its tests | Gate only | `admin/**`, any dashboard file |
| **W2 — Backend Admin module** | `server/src/features/complaints/admin/**` (status-change endpoint) + its tests | Gate only | `resident/**` |
| **W3 — Admin dashboard integration** | `admin-dashboard.service.ts`, `admin-dashboard.controller.ts`, `AdminDashboardPage.tsx`'s complaint cards | W2 (needs its status/count query shape) | Resident dashboard files (`resident-ledger-service.ts`, `ResidentDashboardOverview.tsx`) |
| **W4 — Resident dashboard integration** | `resident-ledger-service.ts`, `ResidentDashboardOverview.tsx`'s complaint list | W1 (needs the list-with-upvote-count query) | Admin dashboard files |
| **W5 — Frontend owner surface** | Complaints list page, Log Complaint form, upvote control, under `client/src/resident/**` | W1's API/Zod shape (can start against a stubbed shape before W1 fully lands) | Admin-side frontend files |
| **W6 — Frontend admin surface** | Admin status-change control, under `client/src/admin/**` | W2's API/Zod shape | Resident-side frontend files |

Notes:
- W1 and W2 can run fully in parallel — they touch disjoint directories
  and don't call into each other.
- W3 and W4 can run fully in parallel once their respective dependency
  (W2 and W1) has a stable function signature — they touch disjoint
  existing files (admin dashboard vs. resident dashboard).
- W5 and W6 can run fully in parallel — disjoint frontend directories,
  and Epic 4 (owner edit/delete, which W5's UI needs to render lock state
  correctly) is the one piece not listed as its own workstream above: it
  depends on both the gate and W1, so schedule it as a short follow-on
  inside W1's scope (same files, same owner) rather than a seventh
  parallel workstream.

## Coordination Notes
- W3/W4 don't need W2/W1 fully finished to start — a one-line contract
  (function name + return shape, e.g. `getDashboardSummary(...): { openComplaintsCount, byStatus }`)
  is enough to unblock them.
- W5/W6 similarly only need the Zod schema shapes from W1/W2, not full
  backend completion, to start building forms and UI against a mocked
  response.
- If agent capacity is limited, the recommended minimum-parallelism order
  is: gate → {W1, W2} → {W3, W4, W5, W6} — two rounds of two-way
  parallelism, not six agents at once.
