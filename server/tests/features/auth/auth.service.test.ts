import jwt from 'jsonwebtoken';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';
import { InvalidCredentialsError, login } from '../../../src/features/auth/auth.service';

describe('login service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `login-${suffix}@example.com`;
  const password = 'correct-horse-battery';
  let societyId: string;
  let userId: string;

  afterAll(async () => {
    if (userId) await prisma.refreshToken.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('issues a valid JWT for correct credentials', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Login Test User',
      email,
      password,
      role: 'OWNER',
      societyId,
    });
    userId = user.id;

    const result = await login({ email, password });

    expect(typeof result.accessToken).toBe('string');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.id).toBe(user.id);

    const decoded = jwt.verify(
      result.accessToken,
      process.env.JWT_ACCESS_SECRET!,
    ) as jwt.JwtPayload;
    expect(decoded.sub).toBe(user.id);
    expect(decoded.role).toBe('OWNER');
    expect(decoded.societyId).toBe(societyId);
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    // ~15 minutes, allow a small margin for test execution time.
    expect(decoded.exp! - decoded.iat!).toBeGreaterThan(14 * 60);
    expect(decoded.exp! - decoded.iat!).toBeLessThanOrEqual(15 * 60);
  });

  it('rejects an incorrect password', async () => {
    await expect(login({ email, password: 'wrong-password' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('rejects a nonexistent email with the same error as a wrong password (no enumeration)', async () => {
    await expect(
      login({ email: `nonexistent-${suffix}@example.com`, password: 'anything' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
