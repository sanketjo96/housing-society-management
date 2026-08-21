import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { DuplicateFieldError } from '../../../src/shared/errors/errors';
import { bootstrapSociety } from '../../../src/features/platform-bootstrap/platform-bootstrap.service';

describe('platform-bootstrap service — bootstrapSociety', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdSocietyIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: createdSocietyIds } } });
  });

  it('creates a new Society and its first ADMIN user together', async () => {
    const result = await bootstrapSociety({
      societyName: `Bootstrap Society ${suffix}`,
      societyAddress: '1 Bootstrap Rd',
      adminName: 'Bootstrap Admin',
      adminEmail: `bootstrap-admin-${suffix}@example.com`,
    });
    createdSocietyIds.push(result.societyId);
    createdUserIds.push(result.adminUserId);

    const society = await prisma.society.findUniqueOrThrow({ where: { id: result.societyId } });
    expect(society.name).toBe(`Bootstrap Society ${suffix}`);

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: result.adminUserId } });
    expect(admin.role).toBe('ADMIN');
    expect(admin.societyId).toBe(result.societyId);
    expect(admin.email).toBe(`bootstrap-admin-${suffix}@example.com`);
  });

  it('never accepts a client-supplied societyId — always generates a fresh one', async () => {
    const first = await bootstrapSociety({
      societyName: `Fresh Society A ${suffix}`,
      societyAddress: '2 Bootstrap Rd',
      adminName: 'Admin A',
      adminEmail: `fresh-admin-a-${suffix}@example.com`,
    });
    const second = await bootstrapSociety({
      societyName: `Fresh Society B ${suffix}`,
      societyAddress: '3 Bootstrap Rd',
      adminName: 'Admin B',
      adminEmail: `fresh-admin-b-${suffix}@example.com`,
    });
    createdSocietyIds.push(first.societyId, second.societyId);
    createdUserIds.push(first.adminUserId, second.adminUserId);

    expect(first.societyId).not.toBe(second.societyId);
  });

  it('sends the new admin a real, usable password-reset token', async () => {
    const result = await bootstrapSociety({
      societyName: `Reset Society ${suffix}`,
      societyAddress: '4 Bootstrap Rd',
      adminName: 'Reset Admin',
      adminEmail: `reset-admin-${suffix}@example.com`,
    });
    createdSocietyIds.push(result.societyId);
    createdUserIds.push(result.adminUserId);

    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: result.adminUserId },
    });
    expect(token).toBeTruthy();
  });

  it('rejects a duplicate adminEmail (globally unique)', async () => {
    const email = `duplicate-admin-${suffix}@example.com`;
    const first = await bootstrapSociety({
      societyName: `Dup Society One ${suffix}`,
      societyAddress: '5 Bootstrap Rd',
      adminName: 'Dup Admin One',
      adminEmail: email,
    });
    createdSocietyIds.push(first.societyId);
    createdUserIds.push(first.adminUserId);

    await expect(
      bootstrapSociety({
        societyName: `Dup Society Two ${suffix}`,
        societyAddress: '6 Bootstrap Rd',
        adminName: 'Dup Admin Two',
        adminEmail: email,
      }),
    ).rejects.toThrow(DuplicateFieldError);
  });
});
