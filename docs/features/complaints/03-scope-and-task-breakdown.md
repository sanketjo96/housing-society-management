# Complaints — Scope & Task Breakdown

## In Scope
Owner complaint CRUD (create/list/edit/delete within the live-checked lock
window), society-wide shared list, upvote toggle, admin status
transitions (all four states, any direction), one optional image per
complaint (authenticated serving), audit logging of every mutation, and
admin + owner dashboard integration — per
[`01-requirements.md`](./01-requirements.md) and
[`02-architecture.md`](./02-architecture.md).

## Out of Scope
Notifications, multi-image/other attachments, tenant access, comments/
discussion, admin editing of complaint content, a "my complaints only"
view — see [`05-future-scope.md`](./05-future-scope.md).

---

## Task Breakdown

### Epic 1: Schema
| Task | Description | Effort |
|---|---|---|
| 1.1 | `ComplaintStatus`/`ComplaintPriority` enums + `Complaint` model | 20 min |
| 1.2 | `ComplaintUpvote` model + `@@unique([complaintId, ownerId])` | 15 min |
| 1.3 | Migration (`add_complaints`) | 10 min |

**Epic 1 total: ~45 min**

### Epic 2: Shared Lock Logic
| Task | Description | Effort |
|---|---|---|
| 2.1 | `server/src/shared/complaints/complaint-lock.ts` (`isEditable`) + unit tests covering all four `(status, upvoteCount)` combinations | 20 min |

**Epic 2 total: ~20 min**

### Epic 3: Backend — Owner Create/List
| Task | Description | Effort |
|---|---|---|
| 3.1 | `resident-complaints.service.ts`'s `create` — flat/owner resolution, multipart image handling via `StorageAdapter`, `$transaction` with `AuditLog` | 1.5 hr |
| 3.2 | `list` — society-scoped, includes upvote count per row | 45 min |
| 3.3 | Route/controller/schemas/openapi for create + list | 45 min |
| 3.4 | Authenticated `GET /api/complaints/:id/image` route | 30 min |

**Epic 3 total: ~3.5 hr**

### Epic 4: Backend — Owner Edit/Delete
| Task | Description | Effort |
|---|---|---|
| 4.1 | `update` — lock-checked (via `isEditable`), `$transaction` + `AuditLog` | 45 min |
| 4.2 | `delete` — same lock check | 30 min |
| 4.3 | `ComplaintNotFoundError`/`ComplaintLockedError`/`ForbiddenComplaintAccessError` | 20 min |

**Epic 4 total: ~1.6 hr**

### Epic 5: Backend — Upvote Toggle
| Task | Description | Effort |
|---|---|---|
| 5.1 | Upvote — create-and-catch via `getUniqueConstraintFields` | 30 min |
| 5.2 | Un-upvote — `deleteMany` | 15 min |

**Epic 5 total: ~45 min**

### Epic 6: Backend — Admin Status Management
| Task | Description | Effort |
|---|---|---|
| 6.1 | `admin-complaints.service.ts`'s `changeStatus` + `AuditLog` | 30 min |
| 6.2 | Route/controller/schemas/openapi | 30 min |

**Epic 6 total: ~1 hr**

### Epic 7: Dashboard Integration
| Task | Description | Effort |
|---|---|---|
| 7.1 | `admin-dashboard.service.ts`: `getDashboardSummary` gains open count + per-status counts | 45 min |
| 7.2 | `resident-ledger-service.ts`: `getResidentBalancesSummary` gains the full society-wide complaint list sorted by upvote count | 45 min |
| 7.3 | `AdminDashboardPage.tsx` — complaint count cards | 30 min |
| 7.4 | `ResidentDashboardOverview.tsx` — embedded ranked complaint list | 1 hr |

**Epic 7 total: ~3 hr**

### Epic 8: Frontend — Owner Surface
| Task | Description | Effort |
|---|---|---|
| 8.1 | Complaints list page (`DataTable.tsx` + upvote buttons + status badges) | 2 hr |
| 8.2 | Log Complaint form (RHF + Zod, image upload) | 1.5 hr |
| 8.3 | Edit/delete controls, conditionally rendered per live lock state | 1 hr |
| 8.4 | Nav entry / route wiring | 15 min |

**Epic 8 total: ~4.75 hr**

### Epic 9: Frontend — Admin Surface
| Task | Description | Effort |
|---|---|---|
| 9.1 | Admin status-change control per row | 1 hr |
| 9.2 | Nav entry | 15 min |

**Epic 9 total: ~1.25 hr**

### Epic 10: Documentation & Tests
| Task | Description | Effort |
|---|---|---|
| 10.1 | This `docs/features/complaints/` folder (already complete) | — |
| 10.2 | Backend tests: lock logic, create/edit/delete, upvote toggle race, status change, dashboard extensions, tenant-403 | 3 hr |
| 10.3 | Frontend tests: list, form, upvote, lock-state rendering, both dashboard widgets | 2 hr |

**Epic 10 total: ~5 hr (excluding already-complete docs)**

---

## Total Effort Estimate
- Epic 1 (Schema): ~45 min
- Epic 2 (Shared Lock Logic): ~20 min
- Epic 3 (Backend — Owner Create/List): ~3.5 hr
- Epic 4 (Backend — Owner Edit/Delete): ~1.6 hr
- Epic 5 (Backend — Upvote Toggle): ~45 min
- Epic 6 (Backend — Admin Status Management): ~1 hr
- Epic 7 (Dashboard Integration): ~3 hr
- Epic 8 (Frontend — Owner Surface): ~4.75 hr
- Epic 9 (Frontend — Admin Surface): ~1.25 hr
- Epic 10 (Tests): ~5 hr
- **Total: ~21.5 hours**. Epics 1–2 must land before anything else; Epics
  3–6 can then proceed largely in parallel (see
  [`06-parallel-build-plan.md`](./06-parallel-build-plan.md)); Epic 7
  depends on 3/5/6 existing so the counts/list it surfaces are meaningful;
  Epics 8–9 depend on their respective backend epics' API shape.

## Acceptance Criteria (per epic)
- **Epic 1 done when**: migration applies cleanly; both new models exist
  with the documented indexes/constraints.
- **Epic 2 done when**: `isEditable` is unit-tested against all four
  `(status, upvoteCount)` combinations, including the revert case
  (upvotes back to zero after having been nonzero).
- **Epic 3 done when**: an owner can create a complaint with or without an
  image, and the society-wide list shows every owner's complaints with a
  correct live upvote count.
- **Epic 4 done when**: an owner cannot edit/delete their complaint once
  it has one upvote or a non-Open status, verified by a concurrent-upvote
  race test; edit/delete rights are confirmed to return once the
  condition reverts.
- **Epic 5 done when**: upvoting twice from the same owner is a no-op, not
  an error; un-upvoting a non-existent upvote is a no-op 204.
- **Epic 6 done when**: admin can move a complaint through any status to
  any other status, including reverting from Resolved back to Open.
- **Epic 7 done when**: the admin dashboard's count cards match a direct
  DB count, and the resident dashboard's list is sorted by upvote count
  descending and matches the complaints list page's own ordering.
- **Epic 8/9 done when**: the owner surface and admin surface render
  correctly for their respective roles, and a tenant sees no complaints
  nav entry or route at all.
- **Epic 10 done when**: `npm run build`, `npm run lint`, and `npm test`
  are clean in both `server/` and `client/`.
