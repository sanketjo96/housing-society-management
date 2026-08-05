import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import {
  InvalidRefreshTokenError,
  login,
  logout,
  refreshAccessToken,
} from '../../src/services/auth.service';

describe('refresh token and logout', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `refresh-${suffix}@example.com`;
  const password = 'correct-horse-battery';
  let societyId: string;
  let userId: string;

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('login also issues a refresh token', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({ name: 'Refresh Test User', email, password, role: 'OWNER', societyId });
    userId = user.id;

    const result = await login({ email, password });
    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshToken.length).toBeGreaterThan(32);
  });

  it('a valid refresh token yields a new access token', async () => {
    const { refreshToken } = await login({ email, password });
    const { accessToken } = await refreshAccessToken(refreshToken);
    expect(typeof accessToken).toBe('string');
  });

  it('an invalidated (logged-out) refresh token is rejected', async () => {
    const { refreshToken } = await login({ email, password });

    await logout(refreshToken);

    await expect(refreshAccessToken(refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('rejects a refresh token that was never issued', async () => {
    await expect(refreshAccessToken('not-a-real-token')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('logout is idempotent — logging out twice does not throw', async () => {
    const { refreshToken } = await login({ email, password });
    await logout(refreshToken);
    await expect(logout(refreshToken)).resolves.not.toThrow();
  });
});
