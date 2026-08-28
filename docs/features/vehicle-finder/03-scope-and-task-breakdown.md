# Vehicle Finder — Scope & Task Breakdown

## In Scope
Resident self-service vehicle registration (multiple vehicles, plate + type),
plate-normalized uniqueness per society, a search-by-plate endpoint returning
flat/occupant name/phone number on a match, and deletion of a resident's
vehicles when their tenancy ends — per
[`01-requirements.md`](./01-requirements.md) and
[`02-architecture.md`](./02-architecture.md).

## Out of Scope
Camera/OCR plate scanning, audit logging of lookups, rate limiting, visitor/
guest vehicle logging or any gate/check-in integration, opt-out of
findability — see [`05-future-scope.md`](./05-future-scope.md).

---

## Task Breakdown

### Epic 1: Schema
| Task | Description | Effort |
|---|---|---|
| 1.1 | `VehicleType` enum + `Vehicle` model (`plateNumber`, `type`, `userId`, `societyId`), `@@unique([societyId, plateNumber])` | 20 min |
| 1.2 | Migration (`add_vehicle`) | 10 min |

**Epic 1 total: ~30 min**

### Epic 2: Plate Normalization
| Task | Description | Effort |
|---|---|---|
| 2.1 | `shared/vehicles/normalize-plate.ts` — pure function + unit tests | 20 min |

**Epic 2 total: ~20 min**

### Epic 3: Backend — Resident Self-Service
| Task | Description | Effort |
|---|---|---|
| 3.1 | `resident-vehicles.service.ts` — register (create-and-catch-P2002 via `getUniqueConstraintFields`, same pattern as `createFeeType`), list-own (`scopedWhere`), delete-own (`deleteMany` scoped to caller's own `userId`) | 1 hour |
| 3.2 | `resident-vehicles.controller.ts` + `.route.ts` (`POST/GET/DELETE /api/me/vehicles[/:id]`) | 30 min |
| 3.3 | `resident-vehicles.schemas.ts` — Zod for `plateNumber`/`type` | 15 min |

**Epic 3 total: ~1.75 hours**

### Epic 4: Backend — Search
| Task | Description | Effort |
|---|---|---|
| 4.1 | `vehicle-lookup.service.ts` — normalize, `scopedWhere` lookup, resolve flat via registrant's owned/current-tenant relation | 40 min |
| 4.2 | `vehicle-lookup.controller.ts` + `.route.ts` (`GET /api/vehicles/search`) | 20 min |

**Epic 4 total: ~1 hour**

### Epic 5: Backend — Tenancy-End Cleanup
| Task | Description | Effort |
|---|---|---|
| 5.1 | Hook `prisma.vehicle.deleteMany({ where: { userId: openOccupancy.tenantId } })` into all three existing tenant-removal transactions: `removeOwnTenant` (resident), `removeTenant` (admin), and `applyOccupancy`'s owner-revert branch (the combined flat-edit form, shared by both `PUT /api/me/flat` and the admin's flat update) | 45 min |

**Epic 5 total: ~45 min**

### Epic 6: Frontend
| Task | Description | Effort |
|---|---|---|
| 6.1 | `MyDetailsPage.tsx` — split into two tabs, "My Info" (existing content, unchanged) and "Vehicle Info" (new) | 30 min |
| 6.2 | "Vehicle Info" tab contents — register form + `DataTable.tsx` list, delete action | 1.5 hours |
| 6.3 | Vehicle Finder page — text input, submit, result card / "not found" state | 1 hour |
| 6.4 | Nav entry / route wiring for the Vehicle Finder page | 15 min |

**Epic 6 total: ~3.25 hours**

### Epic 7: Documentation & Tests
| Task | Description | Effort |
|---|---|---|
| 7.1 | This `docs/features/vehicle-finder/` folder (already complete) | — |
| 7.2 | Backend tests: `normalize-plate.test.ts`, `resident-vehicles.test.ts` (register/duplicate/list/delete), `vehicle-lookup.test.ts` (hit/miss), tenancy-end cleanup test | 2 hours |
| 7.3 | Frontend tests: `MyDetailsPage.tsx` tab switch + Vehicle Info tab, Vehicle Finder page (hit/miss states) | 1.5 hours |

**Epic 7 total: ~3.5 hours (excluding already-complete docs)**

---

## Total Effort Estimate
- Epic 1 (Schema): ~30 min
- Epic 2 (Normalization): ~20 min
- Epic 3 (Resident Self-Service): ~1.75 hours
- Epic 4 (Search): ~1 hour
- Epic 5 (Tenancy-End Cleanup): ~45 min
- Epic 6 (Frontend): ~3.25 hours
- Epic 7 (Tests): ~3.5 hours
- **Total: ~10.9 hours.** Epics 1–2 must land before Epics 3–4 (nothing
  downstream compiles without the schema or the normalization function);
  Epic 5 depends only on Epic 1 and can run in parallel with Epics 3–4;
  Epic 6 depends on Epics 3–4 existing.

## Acceptance Criteria (per epic)
- **Epic 1 done when**: migration applies cleanly; `@@unique([societyId,
  plateNumber])` rejects a second registration of the same normalized plate
  within a society.
- **Epic 2 done when**: `normalizePlate` collapses representative variants
  (spacing, dashes, case) of the same plate to one canonical string.
- **Epic 3 done when**: a resident can register, list, and delete their own
  vehicles; registering a plate already taken in the same society is
  rejected; a resident cannot list or delete another resident's vehicle.
- **Epic 4 done when**: searching a registered plate returns the correct
  flat/occupant name/phone; searching an unregistered or cross-society plate
  returns a plain "not found".
- **Epic 5 done when**: removing a tenant from a flat deletes that tenant's
  registered vehicles, verified by a subsequent search no longer matching.
- **Epic 6 done when**: My Details shows both tabs with My Info unchanged; a
  resident can register/view/delete vehicles from the Vehicle Info tab; the
  Vehicle Finder page correctly displays both the hit and miss states.
- **Epic 7 done when**: `npm run build`, `npm run lint`, and `npm test` are
  clean in both `server/` and `client/`.
