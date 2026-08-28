# Vehicle Finder — Roadmap

Principle: build bottom-up — schema and plate normalization first, since
nothing else compiles without them, then the two backend endpoint groups
(which are independent of each other and can build in parallel), then the
tenancy-end hook, then the frontend. This is a small, single-track feature
with no cross-feature balance or notification integration to sequence
around.

## Suggested Build Order

```
1. Schema (Epic 1)
   VehicleType enum, Vehicle model, migration
   ── nothing downstream compiles without this

2. Plate Normalization (Epic 2)
   shared/vehicles/normalize-plate.ts
   ── independent of the schema; can build in parallel with Epic 1, but
      both must land before Epics 3–4

3. Backend — Resident Self-Service (Epic 3)
   register/list/delete-own endpoints
   ── independent of Epic 4; can run in parallel

4. Backend — Search (Epic 4)
   search endpoint
   ── independent of Epic 3; can run in parallel

5. Backend — Tenancy-End Cleanup (Epic 5)
   deleteMany hook in the existing tenant-removal transaction
   ── depends only on Epic 1 (the Vehicle model existing); can land any
      time after that, but should land before Epic 6 so the frontend never
      has to work around stale vehicle rows during manual testing

6. Frontend (Epic 6)
   MyDetailsPage.tsx split into My Info / Vehicle Info tabs, Vehicle Finder page
   ── depends on Epics 3 and 4 existing

7. Tests (Epic 7)
   Written alongside each epic in practice — listed last only as the final
   gate
```

No pre-launch external-dependency blocker — everything here is local schema,
a pure function, and two small endpoint groups; nothing to register or get
approved ahead of time (unlike, e.g., a WhatsApp template).

## Explicit Non-Goals of This Roadmap
- Do not build camera/OCR scanning "while we're in the area" — it's
  explicitly future-scope, and its accuracy needs to be evaluated against
  real plate photos before any engineering time is committed.
- Do not add rate limiting speculatively — deferred until a real misuse
  pattern is reported.
- Do not extend this into visitor/guest vehicle tracking or any gate/
  check-in flow — a different, explicitly out-of-scope domain per
  `CLAUDE.md`.
- Do not add audit logging of lookups "just in case" — explicitly declined
  for this feature, not merely deferred; see Confirmed Product Decision #1
  in `01-requirements.md`.
