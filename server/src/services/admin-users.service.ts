import bcrypt from 'bcrypt';
import type { Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { getUniqueConstraintFields } from '../lib/prisma-errors';

export class DuplicateFieldError extends Error {
  constructor(public readonly fields: string[]) {
    super(`${fields.join(', ')} already in use`);
    this.name = 'DuplicateFieldError';
  }
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
  societyId: string;
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
