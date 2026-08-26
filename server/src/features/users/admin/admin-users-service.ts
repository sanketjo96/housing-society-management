import bcrypt from 'bcrypt';
import type { Role } from '../../../infrastructure/prisma/generated/client';
import { prisma } from '../../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../../shared/errors/prisma-errors';
import { scopedWhere } from '../../../shared/security/tenant-scope';

export { DuplicateFieldError };

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
  societyId: string;
}

// A user id belonging to a different society returns null, same as a nonexistent
// id. findFirst, not findUnique — societyId isn't part of User's unique key.
export async function getUserById(id: string, societyId: string) {
  return prisma.user.findFirst({
    where: scopedWhere(societyId, { id }),
    select: { id: true, name: true, email: true, phone: true, role: true, societyId: true },
  });
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    return await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: input.role,
        societyId: input.societyId,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, societyId: true },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields);
    throw err;
  }
}
