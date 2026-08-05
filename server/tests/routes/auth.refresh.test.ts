import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';

describe('POST /api/auth/refresh and POST /api/auth/logout', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `route-refresh-${suffix}@example.com`;
  const password = 'correct-horse-battery';
  let societyId: string;
  let userId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Route Refresh Test User',
      email,
      password,
      role: 'TENANT',
      societyId,
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('refreshes an access token given a valid refresh token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    const { refreshToken } = loginRes.body;

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rejects refresh after logout', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    const { refreshToken } = loginRes.body;

    const logoutRes = await request(app).post('/api/auth/logout').send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'bogus' });
    expect(res.status).toBe(401);
  });
});
