import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin/admin-users-service';

describe('GET /api/auth/me', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `me-${suffix}@example.com`;
  const password = 'correct-horse-battery';
  let societyId: string;
  let userId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Me Endpoint Test User',
      email,
      password,
      role: 'OWNER',
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

  it('returns the current user for a valid access token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    const { accessToken } = loginRes.body;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
    expect(res.body.email).toBe(email);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('returns 401 with no access token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired/invalid access token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
