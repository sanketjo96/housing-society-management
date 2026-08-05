# Architecture

Cross-cutting concerns that don't belong to any single feature — built up starting
Phase 2, re-audited in Task 9.1.

## Multi-tenancy enforcement (Task 2.6)

### The threat this closes

Every resource in this system (`User`, `Flat`, `MaintenanceRecord`, `PaymentProof`,
...) belongs to exactly one `Society`. Nothing about a resource's *id* reveals which
society it belongs to, and ids aren't secret — they show up in URLs
(`GET /api/admin/users/:id`), logs, browser history. If a query only ever filters by
id, **any authenticated user from any society could read (or worse, modify) any other
society's data**, just by guessing or observing a valid id. This is the single
highest-risk correctness area in the whole system (re-audited explicitly in Task 9.1
for exactly this reason).

### Proven, not assumed

This wasn't fixed speculatively — the actual leak was demonstrated first, per the
task's TDD approach:

1. Built `GET /api/admin/users/:id` with a plain `findUnique({ where: { id } })` — no
   society check at all.
2. Wrote a test: Admin from Society A requests a user id belonging to Society B.
   **It returned `200` with Society B's full user record.** Confirmed, not
   theoretical — the test failed exactly as expected, proving the vulnerability
   existed in the code that had just been written.
3. Added the fix (below), reran the same test — `404`.
4. Verified a second way, directly against the real running Docker container (not
   just Vitest): created two live societies, an admin in one, a user in the other,
   logged in for a real JWT, made a real HTTP request through nginx → backend, got
   `404`.

### The mechanism: `scopedWhere()`, not middleware or an automatic Prisma extension

```ts
// src/lib/tenant-scope.ts
export function scopedWhere<T extends Record<string, unknown>>(
  societyId: string,
  where: T = {} as T,
): T & { societyId: string } {
  return { ...where, societyId };
}
```

Used like this in a service:

```ts
export async function getUserById(id: string, societyId: string) {
  return prisma.user.findFirst({
    where: scopedWhere(societyId, { id }),
    select: { ... },
  });
}
```

Two design choices worth explaining, since "middleware" was the task's suggested
shape and this isn't literally that:

- **A plain function, not Express middleware.** Services (`src/services/*.service.ts`)
  never import Express types, by convention (see this doc's architecture section /
  `CLAUDE.md`) — scoping has to happen inside the service, at the query itself, so an
  Express-shaped middleware wrapping `req`/`res` is the wrong tool for where the work
  actually needs to happen. The Express-level piece — establishing a *trusted*
  `societyId` in the first place — is `requireRole`'s job (Task 2.5), which verifies
  the JWT and attaches `req.user.societyId`. Task 2.6's job starts where that ends:
  taking that already-trusted value and actually using it in every query.
- **Not a fully-automatic Prisma Client Extension** (a `$extends()` that rewrites
  every query's `where` clause transparently). Considered this, rejected it: this
  schema's `societyId` lives directly on some models (`User`, `Flat`) but only
  reachable through a relation chain on others (`MaintenanceRecord` → `Flat` →
  `societyId`, `PaymentProof` → `MaintenanceRecord` → `Flat` → `societyId`) — one
  generic rule can't handle both shapes correctly without per-model configuration,
  which is real, genuine complexity a 24-flat MVP doesn't need
  (`CLAUDE.md`: "correctness over scale, don't over-engineer"). An explicit function
  every service calls is simpler to verify correct at each call site, at the cost of
  relying on every future service actually calling it — a real tradeoff, made
  deliberately, not accidentally.

### Why `findFirst`, not `findUnique`

`prisma.user.findUnique({ where: { id, societyId } })` looks like it should work, but
Prisma's `findUnique` only reliably filters by fields that are actually part of a
unique constraint — `societyId` isn't part of `User`'s unique key, only `id` is. Using
`findFirst` instead makes "this id, but only if it belongs to this society" a single
atomic query condition, rather than a fetch-then-check-in-application-code pattern
(which would be one extra step a future service could forget).

### The rule going forward

**Every service function that looks up a resource by id must take the caller's
`societyId` as a parameter and build its `where` clause through `scopedWhere()`** —
this is the "single reusable mechanism used everywhere going forward" the task calls
for. `getUserById` above is the reference pattern; Phase 3's flat endpoints, Phase 4's
maintenance record endpoints, and everything after should follow the same shape:
controller reads `req.user.societyId` (trusted, from `requireRole`), passes it into
the service, service scopes its query with it.
