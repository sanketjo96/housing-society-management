// Task 2.6 — the single shared mechanism every future service must use when querying
// data owned by a society, so no query can accidentally leak across societies.
//
// Deliberately a plain helper function, not an Express middleware or an automatic
// Prisma Client Extension. Two reasons:
//
// 1. Our services (src/services/*.service.ts) never import Express types by
//    convention (see CLAUDE.md's "Backend architecture") — an Express-shaped
//    middleware can't run inside a service, and the scoping has to happen at the
//    query itself, which only services touch.
// 2. A fully-automatic Prisma extension that rewrites every query's `where` clause
//    is attractive in theory, but this schema's societyId lives directly on some
//    models (User, Flat) and only indirectly through a relation chain on others
//    (MaintenanceRecord -> Flat -> societyId, PaymentProof -> MaintenanceRecord ->
//    Flat -> societyId) — a single generic rule can't handle both shapes correctly
//    without per-model configuration, which is real complexity this 24-flat MVP
//    doesn't need (CLAUDE.md: "correctness over scale, don't over-engineer").
//
// The actual authenticated societyId comes from requireRole (Task 2.5), which
// verifies the JWT and attaches req.user.societyId — controllers pass that trusted
// value into services, services use this helper to build their `where` clause.
export function scopedWhere<T extends Record<string, unknown>>(
  societyId: string,
  where: T = {} as T,
): T & { societyId: string } {
  return { ...where, societyId };
}
