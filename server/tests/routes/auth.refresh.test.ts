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

  it('refreshes an access token given the httpOnly cookie set at login', async () => {
    // request.agent, not plain request: persists cookies across calls on the same
    // agent, exactly like a real browser session — this is what actually lets the
    // refresh endpoint see the cookie login() set, with no token ever touched by test
    // code directly (mirrors how the real frontend will work: it never reads or
    // stores the refresh token at all).
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({ email, password });
    expect(loginRes.status).toBe(200);

    const res = await agent.post('/api/auth/refresh').send();
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rejects refresh after logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password });

    const logoutRes = await agent.post('/api/auth/logout').send();
    expect(logoutRes.status).toBe(200);

    const refreshRes = await agent.post('/api/auth/refresh').send();
    expect(refreshRes.status).toBe(401);
  });

  it('rejects a request with no refresh token cookie at all', async () => {
    const res = await request(app).post('/api/auth/refresh').send();
    expect(res.status).toBe(401);
  });

  it('rejects an unknown refresh token cookie', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=bogus')
      .send();
    expect(res.status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password });

    const logoutRes = await agent.post('/api/auth/logout').send();
    const setCookie = logoutRes.headers['set-cookie'] as unknown as string[];
    const cleared = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(cleared).toBeDefined();
    // Clearing a cookie is expressed as an immediately-expired Set-Cookie, not an
    // empty response header — this is standard HTTP cookie-deletion mechanics, not
    // something specific to our code.
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
