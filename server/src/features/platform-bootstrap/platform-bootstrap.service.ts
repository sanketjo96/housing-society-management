// Creates a brand-new Society plus its first ADMIN user.
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import { requestPasswordReset } from '../auth/auth.service';

export interface BootstrapSocietyInput {
  societyName: string;
  societyAddress: string;
  adminName: string;
  adminEmail: string;
}

export interface BootstrapSocietyResult {
  societyId: string;
  adminUserId: string;
}

// societyId is generated inside the transaction, never accepted from the caller —
// this can only ever create a new society. The admin's password is a random,
// unusable bcrypt hash; the account becomes usable only via the password-reset
// link sent after the transaction commits.
export async function bootstrapSociety(
  input: BootstrapSocietyInput,
): Promise<BootstrapSocietyResult> {
  let result: { societyId: string; adminUserId: string; adminEmail: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const society = await tx.society.create({
        data: { name: input.societyName, address: input.societyAddress },
      });
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
      const admin = await tx.user.create({
        data: {
          name: input.adminName,
          email: input.adminEmail,
          passwordHash,
          role: 'ADMIN',
          societyId: society.id,
        },
      });
      return { societyId: society.id, adminUserId: admin.id, adminEmail: admin.email };
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields);
    throw err;
  }

  await requestPasswordReset(result.adminEmail);

  return { societyId: result.societyId, adminUserId: result.adminUserId };
}
