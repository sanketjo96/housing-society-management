import type { ComplaintStatus } from '../../infrastructure/prisma/generated/client';

// Stateless by design — no lockedAt flag. An owner may edit/delete their own
// complaint only while it's Open and has zero upvotes; re-evaluating this
// against reverted state (upvote removed, or admin reverts status to Open)
// naturally re-opens edit/delete access with no separate "unlock" action.
// Callers must re-read status and re-count upvotes at write time, inside the
// same transaction as the mutation, to avoid trusting a value read earlier
// in the request (see docs/features/complaints/02-architecture.md).
export function isEditable(status: ComplaintStatus, upvoteCount: number): boolean {
  return status === 'OPEN' && upvoteCount === 0;
}
