import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';

describe('POST /api/auth/login', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `route-login-${suffix}@example.com`;
  const password = 'correct-horse-battery';
  let societyId: string;
  let userId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Route Login Test User',
      email,
      password,
      role: 'TENANT',
      societyId,
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.refreshToken.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('returns a JWT for correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 for an incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a nonexistent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `nobody-${suffix}@example.com`, password: 'anything' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
