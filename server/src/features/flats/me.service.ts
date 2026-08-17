import { prisma } from '../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';

export interface UpdateOwnProfileInput {
  name?: string;
  phone?: string;
  email?: string;
}

// No role/societyId param needed — the caller can only ever update their own row,
// identified by req.user.id (the verified JWT), never an arbitrary :id. See
// CLAUDE.md's "Addition (2026-08-06)".
export async function updateOwnProfile(userId: string, input: UpdateOwnProfileInput) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: input,
      select: { id: true, name: true, email: true, phone: true, role: true, societyId: true },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields);
    throw err;
  }
}
