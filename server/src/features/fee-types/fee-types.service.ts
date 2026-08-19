// Admin-configurable catalog of ad-hoc fee types (Joining Fee, Transfer Fee, Fine,
// etc.) — docs/other-charges/. A real table, not an enum, so a fee type can be added
// without a code deploy. isActive is the only removal mechanism — never hard-deleted,
// since a billed OtherCharge must keep a valid, named reference forever.
import { prisma } from '../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import { scopedWhere } from '../../shared/security/tenant-scope';

export class FeeTypeNotFoundError extends Error {
  constructor() {
    super('Fee type not found');
    this.name = 'FeeTypeNotFoundError';
  }
}

export async function listFeeTypes(societyId: string, includeInactive = false) {
  return prisma.feeType.findMany({
    where: scopedWhere(societyId, includeInactive ? {} : { isActive: true }),
    orderBy: { name: 'asc' },
  });
}

export async function createFeeType(
  societyId: string,
  adminId: string,
  input: { name: string; description?: string },
) {
  let feeType;
  try {
    feeType = await prisma.feeType.create({
      data: { societyId, name: input.name, description: input.description },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'CREATE_FEE_TYPE',
      entityType: 'FeeType',
      entityId: feeType.id,
      note: `Created "${feeType.name}"`,
    },
  });
  return feeType;
}

export async function updateFeeType(
  id: string,
  societyId: string,
  adminId: string,
  input: { name?: string; description?: string; isActive?: boolean },
) {
  const existing = await prisma.feeType.findFirst({ where: { id, societyId } });
  if (!existing) throw new FeeTypeNotFoundError();

  let feeType;
  try {
    feeType = await prisma.feeType.update({
      where: { id },
      data: input,
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'UPDATE_FEE_TYPE',
      entityType: 'FeeType',
      entityId: feeType.id,
      note: `Updated "${feeType.name}"`,
    },
  });
  return feeType;
}
