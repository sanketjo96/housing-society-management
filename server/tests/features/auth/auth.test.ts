import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';

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

  it('returns a JWT for correct credentials, refresh token set as an httpOnly cookie (not in the body)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('refreshToken');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/auth');

    // Locks in a real bug found via manual end-to-end testing: this must default to
    // NOT Secure, since there's no HTTPS yet (Task 10.2) — a Secure cookie is silently
    // dropped by real browsers over plain HTTP (except for a `localhost`-only
    // exception, which is exactly what made this look fine at first). Only
    // COOKIE_SECURE=true should ever add the Secure attribute.
    expect(refreshCookie).not.toContain('Secure');
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
