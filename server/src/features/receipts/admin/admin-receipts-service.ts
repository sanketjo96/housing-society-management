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
          ...LEDGER_ENTRY_LIST_INCLUDE,
          // Fee type(s) an OTHER_CHARGE receipt covered; empty for MAINTENANCE.
          settledOtherCharges: { select: { feeType: { select: { name: true } } } },
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
  });

  // Flatten to plain distinct name strings rather than pushing the raw nested shape.
  return receipts.map(({ ledgerEntry: { settledOtherCharges, ...ledgerEntry }, ...receipt }) => ({
    ...receipt,
    ledgerEntry: {
      ...ledgerEntry,
      otherChargeFeeTypeNames: [...new Set(settledOtherCharges.map((c) => c.feeType.name))],
    },
  }));
}
