// Admin-configurable catalog of society-level income/expense heads (Electricity,
// Salaries, Bank Interest, ...). isActive is the only removal mechanism — never
// hard-deleted, since a recorded SocietyLedgerEntry must keep a valid categoryId.
// Separate from FeeType (resident-billing, no direction concept).
import { prisma } from '../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import { scopedWhere } from '../../shared/security/tenant-scope';
import type { SocietyLedgerDirection } from '../../infrastructure/prisma/generated/client';

export class FinanceCategoryNotFoundError extends Error {
  constructor() {
    super('Finance category not found');
    this.name = 'FinanceCategoryNotFoundError';
  }
}

export async function listFinanceCategories(
  societyId: string,
  includeInactive = false,
  direction?: SocietyLedgerDirection,
) {
  return prisma.societyLedgerCategory.findMany({
    where: scopedWhere(societyId, {
      ...(includeInactive ? {} : { isActive: true }),
      ...(direction ? { direction } : {}),
    }),
    orderBy: { name: 'asc' },
  });
}

export async function createFinanceCategory(
  societyId: string,
  adminId: string,
  input: { name: string; direction: SocietyLedgerDirection; description?: string },
) {
  let category;
  try {
    category = await prisma.societyLedgerCategory.create({
      data: {
        societyId,
        name: input.name,
        direction: input.direction,
        description: input.description,
      },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'CREATE_FINANCE_CATEGORY',
      entityType: 'SocietyLedgerCategory',
      entityId: category.id,
      note: `Created "${category.name}" (${category.direction})`,
    },
  });
  return category;
}

// isActive-only — no rename support yet.
export async function updateFinanceCategory(
  id: string,
  societyId: string,
  adminId: string,
  input: { isActive: boolean },
) {
  const existing = await prisma.societyLedgerCategory.findFirst({ where: { id, societyId } });
  if (!existing) throw new FinanceCategoryNotFoundError();

  const category = await prisma.societyLedgerCategory.update({
    where: { id },
    data: { isActive: input.isActive },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: 'UPDATE_FINANCE_CATEGORY',
      entityType: 'SocietyLedgerCategory',
      entityId: category.id,
      note: `Set isActive=${input.isActive} on "${category.name}"`,
    },
  });
  return category;
}
