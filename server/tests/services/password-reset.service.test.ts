import bcrypt from 'bcrypt';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { login } from '../../src/services/auth.service';
import {
  InvalidResetTokenError,
  requestPasswordReset,
  resetPassword,
} from '../../src/services/password-reset.service';

describe('password reset service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `reset-${suffix}@example.com`;
  const originalPassword = 'original-password-123';
  let societyId: string;
  let userId: string;

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('generates a reset token for an existing email', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Reset Test User',
      email,
      password: originalPassword,
      role: 'OWNER',
      societyId,
    });
    userId = user.id;

    const token = await requestPasswordReset(email);
    expect(typeof token).toBe('string');
    expect(token!.length).toBeGreaterThan(32);
  });

  it('returns null for a nonexistent email (no enumeration)', async () => {
    const token = await requestPasswordReset(`nobody-${suffix}@example.com`);
    expect(token).toBeNull();
  });

  it('a valid unexpired token successfully resets the password', async () => {
    const token = await requestPasswordReset(email);
    await resetPassword(token!, 'brand-new-password-456');

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare('brand-new-password-456', updated.passwordHash)).toBe(true);
    expect(await bcrypt.compare(originalPassword, updated.passwordHash)).toBe(false);
  });

  it('a reused token is rejected', async () => {
    const token = await requestPasswordReset(email);
    await resetPassword(token!, 'first-reset-password');

    await expect(resetPassword(token!, 'second-reset-password')).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('an expired token is rejected', async () => {
    const token = await requestPasswordReset(email);

    await prisma.passwordResetToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(resetPassword(token!, 'too-late-password')).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('rejects a token that was never issued', async () => {
    await expect(resetPassword('not-a-real-token', 'whatever-123')).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('revokes all existing refresh tokens when the password is reset', async () => {
    // Get to a known password first, then log in to establish a real active session.
    const setupToken = await requestPasswordReset(email);
    await resetPassword(setupToken!, 'known-password-789');
    await login({ email, password: 'known-password-789' });

    const beforeReset = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
    });
    expect(beforeReset).not.toBeNull();

    const resetToken = await requestPasswordReset(email);
    await resetPassword(resetToken!, 'final-password-000');

    const stillActive = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
    });
    expect(stillActive).toBeNull();
  });
});
