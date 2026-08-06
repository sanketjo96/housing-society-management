import bcrypt from 'bcrypt';
import type { Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { DuplicateFieldError } from '../lib/errors';
import { getUniqueConstraintFields } from '../lib/prisma-errors';
import { scopedWhere } from '../lib/tenant-scope';

// Re-exported for backward compatibility — existing imports (controllers, tests)
// reference this module directly; the class itself now lives in lib/errors.ts since
// flats.service.ts (Task 3.1) needs it too.
export { DuplicateFieldError };

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
  societyId: string;
}

// Scoped to the caller's own society (Task 2.6) — a user id that belongs to a
// different society returns null, identical to an id that doesn't exist at all.
// findFirst, not findUnique: Prisma's findUnique only reliably supports filtering by
// unique fields, and societyId isn't part of User's unique key. findFirst supports an
// arbitrary combined where clause, so "this id, but only if it's in this society" is
// a single query, not a fetch-then-check-in-application-code pattern (which would be
// easy to accidentally skip in a future service).
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
