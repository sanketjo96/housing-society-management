// Admin Receipt Book: a read-only register of every issued Receipt for the society.
// No query params, no pagination — client filters the full list.
import { prisma } from '../../../infrastructure/prisma/client';
import { LEDGER_ENTRY_LIST_INCLUDE } from '../../ledger/admin/admin-ledger-service';

export async function listReceipts(societyId: string) {
  const receipts = await prisma.receipt.findMany({
    where: { societyId },
    include: {
      ledgerEntry: {
        select: {
          id: true,
          category: true,
          amount: true,
          note: true,
          bankReference: true,
          ...LEDGER_ENTRY_LIST_INCLUDE,
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
  });

  return receipts;
}
