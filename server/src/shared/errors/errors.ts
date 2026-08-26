// Domain error types thrown by services, mapped to a status code by the
// calling controller.

// Thrown when a Prisma unique-constraint (P2002) violation is traced back to a
// field name via getUniqueConstraintFields().
export class DuplicateFieldError extends Error {
  constructor(public readonly fields: string[]) {
    super(`${fields.join(', ')} already in use`);
    this.name = 'DuplicateFieldError';
  }
}

// Shared here (not in ledger.service.ts) so receipt.service.ts can throw/catch
// it without an import cycle between the two.
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

// Thrown when approving a Deposit would issue a receipt with a fully blank
// signatory block — the society needs at least one of Chairman/Secretary
// signature configured first.
export class SignaturesNotConfiguredError extends Error {
  constructor() {
    super(
      'Add at least one signatory signature (Chairman or Secretary) in Settings before approving payments',
    );
    this.name = 'SignaturesNotConfiguredError';
  }
}
