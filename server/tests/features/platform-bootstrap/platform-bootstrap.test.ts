import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';

describe('POST /api/platform/societies', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdSocietyIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.deleteMany({ where: { id: { in: createdSocietyIds } } });
  });

  const body = () => ({
    societyName: `Route Bootstrap Society ${suffix}`,
    societyAddress: '1 Route Rd',
    adminName: 'Route Admin',
    adminEmail: `route-bootstrap-admin-${suffix}@example.com`,
  });

  it('rejects a request with no secret header (403)', async () => {
    const res = await request(app).post('/api/platform/societies').send(body());
    expect(res.status).toBe(403);
  });

  it('rejects a request with the wrong secret (403)', async () => {
    const res = await request(app)
      .post('/api/platform/societies')
      .set('X-Platform-Bootstrap-Secret', 'wrong-secret')
      .send(body());
    expect(res.status).toBe(403);
  });

  it('rejects invalid input even with a valid secret (400)', async () => {
    const res = await request(app)
      .post('/api/platform/societies')
      .set('X-Platform-Bootstrap-Secret', 'test-platform-bootstrap-secret')
      .send({ societyName: '' });
    expect(res.status).toBe(400);
  });

  it('creates a Society + first ADMIN, given a valid secret and valid input (201)', async () => {
    const res = await request(app)
      .post('/api/platform/societies')
      .set('X-Platform-Bootstrap-Secret', 'test-platform-bootstrap-secret')
      .send(body());

    expect(res.status).toBe(201);
    expect(res.body.societyId).toBeTruthy();
    expect(res.body.adminUserId).toBeTruthy();
    expect(res.body.password).toBeUndefined();
    createdSocietyIds.push(res.body.societyId);
    createdUserIds.push(res.body.adminUserId);
  });

  it('rejects a duplicate adminEmail (409)', async () => {
    const res = await request(app)
      .post('/api/platform/societies')
      .set('X-Platform-Bootstrap-Secret', 'test-platform-bootstrap-secret')
      .send(body());
    expect(res.status).toBe(409);
  });

  // The "PLATFORM_BOOTSTRAP_SECRET unset" (503) case is covered at the unit level
  // instead (tests/shared/middleware/require-platform-secret.test.ts) — deliberately
  // not here, since mutating this shared env var mid-suite would race against any
  // other test file concurrently hitting this same route.
});
