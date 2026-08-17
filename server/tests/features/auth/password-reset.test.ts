import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';
import { requestPasswordReset } from '../../../src/features/auth/password-reset.service';

describe('POST /api/auth/request-reset and POST /api/auth/reset', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `route-reset-${suffix}@example.com`;
  let societyId: string;
  let userId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Route Reset Test User',
      email,
      password: 'original-password-123',
      role: 'TENANT',
      societyId,
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('POST /api/auth/request-reset always returns 200, regardless of whether the email exists', async () => {
    const known = await request(app).post('/api/auth/request-reset').send({ email });
    expect(known.status).toBe(200);

    const unknown = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: `nobody-${suffix}@example.com` });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it('POST /api/auth/reset resets the password given a valid token, then rejects reuse', async () => {
    // The endpoint never returns the token over HTTP (that would defeat the point of
    // email-based reset) — call the service directly to get it, same as reading it
    // from the stubbed "email" (console log) a real user would see.
    const token = await requestPasswordReset(email);

    const resetRes = await request(app)
      .post('/api/auth/reset')
      .send({ token, newPassword: 'new-password-456' });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'new-password-456' });
    expect(loginRes.status).toBe(200);

    const reuseRes = await request(app)
      .post('/api/auth/reset')
      .send({ token, newPassword: 'another-password-789' });
    expect(reuseRes.status).toBe(401);
  });

  it('POST /api/auth/reset returns 401 for an unknown token', async () => {
    const res = await request(app)
      .post('/api/auth/reset')
      .send({ token: 'bogus', newPassword: 'whatever-1234' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/reset returns 400 for an invalid new password', async () => {
    const token = await requestPasswordReset(email);
    const res = await request(app).post('/api/auth/reset').send({ token, newPassword: 'short' });
    expect(res.status).toBe(400);
  });
});
