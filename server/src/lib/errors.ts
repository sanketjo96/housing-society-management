// Shared domain error types, thrown by services (never HTTP-aware — see CLAUDE.md's
// "Backend architecture") and mapped to a status code by the calling controller.

// Thrown when a Prisma unique-constraint (P2002) violation is traced back to specific
// field name(s) via getUniqueConstraintFields() (src/lib/prisma-errors.ts). Originally
// lived in admin-users.service.ts (Task 2.1); moved here once flats.service.ts (Task
// 3.1) needed the same error for a different unique constraint
// (@@unique([societyId, block, flatNumber])) — the shape isn't user-specific.
export class DuplicateFieldError extends Error {
  constructor(public readonly fields: string[]) {
    super(`${fields.join(', ')} already in use`);
    this.name = 'DuplicateFieldError';
  }
}
