// Admin Receipt Book: a read-only register of every issued Receipt for the society —
// distinct from the ledger/admin approval queue, which is a pending-review workflow.
// No query params, no pagination — same unbounded-findMany, client-filters-the-rest
// convention as ledger/admin's listPendingLedgerEntries (this feature's direct
// template), consistent with this 24-flat MVP's philosophy (see DataTable.tsx).
import { prisma } from '../../../infrastructure/prisma/client';
import { LEDGER_ENTRY_LIST_INCLUDE } from '../../ledger/admin/admin-ledger-service';

export async function listReceipts(societyId: string) {
  return prisma.receipt.findMany({
    where: { societyId },
    include: {
      ledgerEntry: { select: { id: true, type: true, amount: true, note: true, ...LEDGER_ENTRY_LIST_INCLUDE } },
    },
    orderBy: { issuedAt: 'desc' },
  });
}
