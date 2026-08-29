# Complaints — Roadmap

Principle: build bottom-up — schema and the shared lock function first,
since every other epic either writes `Complaint`/`ComplaintUpvote` rows or
depends on the lock rule to gate a mutation. Unlike
`docs/features/observability/`'s staged rollout, this is one cohesive
feature with a natural dependency order, not a set of independently
useful stages.

## Suggested Build Order

```
1. Schema (Epic 1)
   ComplaintStatus/ComplaintPriority enums, Complaint + ComplaintUpvote
   models, migration
   ── nothing downstream can be built or tested without this

2. Shared Lock Logic (Epic 2)
   complaint-lock.ts's isEditable, unit-tested standalone
   ── needed before Epic 4 (owner edit/delete) can be written correctly

3. Backend — Owner Create/List, Upvote Toggle, Admin Status Management
   (Epics 3, 5, 6 — can proceed in parallel; see 06-parallel-build-plan.md)
   ── these three don't depend on each other or on Epic 4

4. Backend — Owner Edit/Delete (Epic 4)
   ── depends on Epics 2 and 3 (needs the lock function and the create
      path to exist first)

5. Dashboard Integration (Epic 7)
   Admin count cards + resident ranked list
   ── depends on Epics 3/5/6 existing so the counts/list it surfaces are
      meaningful, not just plumbing against empty tables

6. Frontend — Owner Surface (Epic 8)
   ── depends on Epics 3/4/5's API shape

7. Frontend — Admin Surface (Epic 9)
   ── depends on Epic 6's API shape and Epic 7's dashboard fields

8. Tests (Epic 10)
   Written alongside each epic above in practice, not deferred to the end
   — listed last here only because it's the final gate before calling
   this done
```

## Explicit Non-Goals of This Roadmap
- Do not build notifications "while we're in the area" — explicitly
  deferred, see `05-future-scope.md` item 1.
- Do not add a "my complaints" filtered view speculatively — the
  confirmed v1 scope is a shared, society-wide list.
- Do not let admin content-editing capability sneak in under the
  status-change endpoint — Rejected is the only moderation lever
  (Confirmed Product Decision #6).
- Do not let this feature expand into gate/visitor management or notices/
  announcements just because the UI patterns are superficially similar —
  both remain explicitly out of scope per `CLAUDE.md`.
