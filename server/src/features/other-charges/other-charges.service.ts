// Admin-billed ad-hoc charges (joining fee, transfer fee, fine, ...) — docs/other-
// charges/. A fully separate pool from maintenance dues: OtherCharge rows never
// touch MaintenanceRecord's settlement math, and no Receipt is ever issued for
// billing one (Receipts are money-received-only, issued when a Deposit/Credit
// against this pool is later approved).
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infrastructure/prisma/client';
import { logger } from '../../infrastructure/observability';
import { computeRecordSettlements, type RecordSettlement } from '../ledger/ledger-shared';
import { notify } from '../notifications/notification.service';

// Same "billed + 15 days" convention as MaintenanceRecord.dueDate
// (maintenance-record.service.ts's DUE_DATE_DAYS) — no per-charge custom due date
// in v1 (docs/other-charges/05-future-scope.md).
const DUE_DATE_DAYS = 15;

export class FeeTypeNotBillableError extends Error {
  constructor() {
    super('This fee type is not available for billing (missing, inactive, or wrong society)');
    this.name = 'FeeTypeNotBillableError';
  }
}

export class FlatNotFoundError extends Error {
  constructor() {
    super('Flat not found');
    this.name = 'FlatNotFoundError';
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super('Amount must be greater than 0');
    this.name = 'InvalidAmountError';
  }
}

const OTHER_CHARGE_LIST_INCLUDE = {
  payer: { select: { id: true, name: true, email: true } },
  flat: { select: { id: true, wing: true, flatNumber: true } },
  feeType: { select: { id: true, name: true } },
  billedBy: { select: { id: true, name: true } },
} as const;

export interface OtherChargeListItem {
  id: string;
  amount: unknown;
  note: string | null;
  dueDate: Date;
  createdAt: Date;
  settlementStatus: RecordSettlement['status'];
  settledAmount: number;
}

// Newest-first billing history, each row's settlement status computed against the
// flat's own Other-Charges pool (never mixed with any other flat's or with
// maintenance) — same FIFO fill (computeRecordSettlements) the resident-facing book
// page uses, just run once per flat here rather than once for "the" flat.
export async function listOtherCharges(societyId: string): Promise<OtherChargeListItem[]> {
  const charges = await prisma.otherCharge.findMany({
    where: { flat: { societyId } },
    include: OTHER_CHARGE_LIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const entriesByFlat = new Map<string, { status: string; amount: unknown }[]>();
  const chargesByFlat = new Map<string, typeof charges>();
  for (const charge of charges) {
    chargesByFlat.set(charge.flatId, [...(chargesByFlat.get(charge.flatId) ?? []), charge]);
  }

  const flatIds = [...chargesByFlat.keys()];
  const entries = await prisma.ledgerEntry.findMany({
    where: { flatId: { in: flatIds }, category: 'OTHER_CHARGE' },
    select: { flatId: true, status: true, amount: true },
  });
  for (const entry of entries) {
    entriesByFlat.set(entry.flatId, [...(entriesByFlat.get(entry.flatId) ?? []), entry]);
  }

  const result: OtherChargeListItem[] = [];
  for (const [flatId, flatCharges] of chargesByFlat) {
    const flatEntries = entriesByFlat.get(flatId) ?? [];
    const approvedFunds = flatEntries
      .filter((e) => e.status === 'APPROVED')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const settlements = computeRecordSettlements(
      flatCharges.map((c) => ({ id: c.id, period: c.dueDate.toISOString(), amount: c.amount })),
      approvedFunds,
    );
    for (const charge of flatCharges) {
      const settlement = settlements.get(charge.id);
      result.push({
        ...charge,
        settlementStatus: settlement?.status ?? 'UNPAID',
        settledAmount: settlement?.settledAmount ?? 0,
      });
    }
  }

  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function notifyOtherChargeBilled(
  charge: { id: string; flatId: string; amount: unknown; dueDate: Date; note: string | null },
  feeTypeName: string,
  payerId: string,
  societyId: string,
): Promise<void> {
  try {
    await notify({
      eventId: randomUUID(),
      eventType: 'OTHER_CHARGE_BILLED',
      occurredAt: new Date().toISOString(),
      recipient: { userId: payerId },
      data: {
        chargeId: charge.id,
        flatId: charge.flatId,
        societyId,
        feeTypeName,
        amount: Number(charge.amount),
        dueDate: charge.dueDate.toISOString(),
        note: charge.note ?? undefined,
      },
    });
  } catch (err) {
    logger
      .child({ feature: 'other-charges' })
      .error({ err, chargeId: charge.id }, 'failed to enqueue OTHER_CHARGE_BILLED notification');
  }
}

// The one write path. flatId/feeTypeId are both revalidated server-side against
// societyId (never trusted from the client beyond existence). payerId is always
// resolved to flat.ownerId here, never accepted from the client — same "resolved
// once, server-side" contract as MaintenanceRecord.payerId.
export async function billOtherCharge(
  societyId: string,
  adminId: string,
  input: { flatId: string; feeTypeId: string; amount: number; note?: string },
) {
  if (!(input.amount > 0)) throw new InvalidAmountError();

  const flat = await prisma.flat.findFirst({ where: { id: input.flatId, societyId } });
  if (!flat) throw new FlatNotFoundError();

  const feeType = await prisma.feeType.findFirst({
    where: { id: input.feeTypeId, societyId, isActive: true },
  });
  if (!feeType) throw new FeeTypeNotBillableError();

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DUE_DATE_DAYS);

  const charge = await prisma.$transaction(async (tx) => {
    const charge = await tx.otherCharge.create({
      data: {
        flatId: flat.id,
        payerId: flat.ownerId,
        feeTypeId: feeType.id,
        billedById: adminId,
        amount: input.amount,
        note: input.note,
        dueDate,
      },
      include: OTHER_CHARGE_LIST_INCLUDE,
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'BILL_OTHER_CHARGE',
        entityType: 'OtherCharge',
        entityId: charge.id,
        note: `${feeType.name}: ${input.amount} billed to flat ${flat.wing}-${flat.flatNumber}`,
      },
    });
    return charge;
  });

  await notifyOtherChargeBilled(charge, feeType.name, flat.ownerId, societyId);

  return charge;
}
