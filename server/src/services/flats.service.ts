import { prisma } from '../db';
import { DuplicateFieldError } from '../lib/errors';
import { getUniqueConstraintFields } from '../lib/prisma-errors';
import { scopedWhere } from '../lib/tenant-scope';

// Thrown when ownerId doesn't resolve to an OWNER-role user within the caller's own
// society — covers "id doesn't exist," "id belongs to a different society" (tenant
// scoping — Task 2.6), and "id exists but isn't an OWNER" (e.g. a tenant or admin id)
// with one error, since none of those are the client's business to distinguish.
export class InvalidOwnerError extends Error {
  constructor() {
    super('ownerId must reference an existing OWNER in this society');
    this.name = 'InvalidOwnerError';
  }
}

export interface CreateFlatInput {
  societyId: string;
  block: string;
  flatNumber: string;
  baseRate: number;
  ownerId: string;
}

export interface UpdateFlatInput {
  block?: string;
  flatNumber?: string;
  baseRate?: number;
  ownerId?: string;
}

async function assertValidOwner(societyId: string, ownerId: string) {
  const owner = await prisma.user.findFirst({
    where: scopedWhere(societyId, { id: ownerId, role: 'OWNER' as const }),
    select: { id: true },
  });
  if (!owner) throw new InvalidOwnerError();
}

export async function createFlat(input: CreateFlatInput) {
  await assertValidOwner(input.societyId, input.ownerId);

  try {
    return await prisma.flat.create({
      data: {
        block: input.block,
        flatNumber: input.flatNumber,
        baseRate: input.baseRate,
        societyId: input.societyId,
        ownerId: input.ownerId,
      },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }
}

// Returns null if the flat doesn't exist, or exists but belongs to a different society
// (Task 2.6 tenant scoping) — same "not found" outcome either way, so a caller can't
// tell a wrong-society id apart from a nonexistent one.
export async function updateFlat(id: string, societyId: string, input: UpdateFlatInput) {
  const existing = await prisma.flat.findFirst({ where: scopedWhere(societyId, { id }), select: { id: true } });
  if (!existing) return null;

  if (input.ownerId !== undefined) {
    await assertValidOwner(societyId, input.ownerId);
  }

  try {
    return await prisma.flat.update({
      where: { id },
      data: {
        block: input.block,
        flatNumber: input.flatNumber,
        baseRate: input.baseRate,
        ownerId: input.ownerId,
      },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }
}
