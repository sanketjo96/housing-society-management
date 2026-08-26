// Shared domain error types, thrown by services (never HTTP-aware — see CLAUDE.md's
// "Backend architecture") and mapped to a status code by the calling controller.

// Thrown when a Prisma unique-constraint (P2002) violation is traced back to specific
// field name(s) via getUniqueConstraintFields() (src/shared/errors/prisma-errors.ts). Originally
// lived in admin-users.service.ts (Task 2.1); moved here once flats.service.ts (Task
// 3.1) needed the same error for a different unique constraint
// (@@unique([societyId, wing, flatNumber])) — the shape isn't user-specific.
export class DuplicateFieldError extends Error {
  constructor(public readonly fields: string[]) {
    super(`${fields.join(', ')} already in use`);
    this.name = 'DuplicateFieldError';
  }
}

// Originally defined in ledger.service.ts; moved here (Receipt Generation &
// Approval Workflow, 2026-08-11) so receipt.service.ts can throw/catch the exact
// same error class without creating a ledger.service.ts <-> receipt.service.ts
// import cycle (ledger.service.ts calls into receipt.service.ts for issuance,
// receipt.service.ts needs these same statuses for its own preview/view checks).
// Re-exported from ledger.service.ts below so every existing import site is
// unaffected.
export class LedgerEntryAlreadyReviewedError extends Error {
  constructor() {
    super('This ledger entry has already been reviewed');
    this.name = 'LedgerEntryAlreadyReviewedError';
  }
}

export class ForbiddenLedgerEntryAccessError extends Error {
  constructor() {
    super('You do not have access to this ledger entry');
    this.name = 'ForbiddenLedgerEntryAccessError';
  }
}

// Guards against issuing a receipt with a fully blank signatory block. Thrown by
// receipt.service.ts's assertSignaturesConfigured, called from both the approval
// preview and the real approve/manualDeposit paths — a society must have at least
// one of the Chairman/Secretary committee signatures uploaded (Settings ->
// Committee) before any Deposit can be approved. This is a deliberate exception to
// this app's usual "never block a financial transaction over a decorative image"
// rule (see getSignatureBufferOrUndefined) — that rule covers a signature file
// that's missing/unreadable *at render time* despite being configured; this error
// covers the case where nothing was ever configured at all, which the admin can
// and must fix before approving anything.
export class SignaturesNotConfiguredError extends Error {
  constructor() {
    super(
      'Add at least one signatory signature (Chairman or Secretary) in Settings before approving payments',
    );
    this.name = 'SignaturesNotConfiguredError';
  }
}
