// Admin Receipt Book: a read-only register of every issued Receipt for the society —
// distinct from the ledger/admin approval queue, which is a pending-review workflow.
// No query params, no pagination — same unbounded-findMany, client-filters-the-rest
// convention as ledger/admin's listPendingLedgerEntries (this feature's direct
// template), consistent with this 24-flat MVP's philosophy (see DataTable.tsx).
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
          // 2026-08-24 addition: the fee type(s) an OTHER_CHARGE receipt actually
          // covered (OtherCharge.settledByLedgerEntryId, stamped at approval time)
          // — empty for a MAINTENANCE receipt or a legacy OTHER_CHARGE one approved
          // before this shipped (never backfilled).
          settledOtherCharges: { select: { feeType: { select: { name: true } } } },
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
  });

  // Flatten to plain distinct name strings here rather than pushing the raw nested
  // shape ({ settledOtherCharges: [{ feeType: { name } }] }) onto the frontend —
  // same "backend returns exactly what the UI needs" convention this list already
  // follows for every other field.
  return receipts.map(({ ledgerEntry: { settledOtherCharges, ...ledgerEntry }, ...receipt }) => ({
    ...receipt,
    ledgerEntry: {
      ...ledgerEntry,
      otherChargeFeeTypeNames: [...new Set(settledOtherCharges.map((c) => c.feeType.name))],
    },
  }));
}
