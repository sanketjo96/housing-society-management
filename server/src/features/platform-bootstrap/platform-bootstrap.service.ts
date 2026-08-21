// Phase A of docs/society-onboarding/ — the one genuinely new mechanism that plan
// adds. Every other bulk-import path in that plan is a thin wrapper around an
// existing single-row service (createFlat, billOtherCharge,
// recordSocietyLedgerEntry); this one has no such precedent, since nothing in this
// codebase has ever created a Society outside prisma/seed.ts.
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

// societyId is generated inside the transaction — never accepted from the caller —
// so this endpoint can only ever create a brand-new society, never reach into an
// existing one (the vulnerability class docs/security-audit.md finding 9.1 fixed:
// a client-supplied societyId letting an existing ADMIN reach another society's
// data). The admin's password is a random, unusable value (bcrypt-hashed, same
// convention as findOrCreateUserByEmail/createUser) — the account becomes usable
// only via the password-reset link requestPasswordReset() sends, run *after* the
// transaction commits, not inside it (sending an email isn't something a DB
// transaction should be able to roll back).
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
