import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';
import { login } from '../../../src/features/auth/auth.service';

describe('POST /api/admin/users', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  const createdUserIds: string[] = [];
  let adminToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Test Admin',
      email: `guard-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Test Owner (non-admin)',
      email: `guard-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .send({
        name: 'Nobody',
        email: `noauth-${suffix}@example.com`,
        password: 'password-123',
        role: 'OWNER',
        societyId,
      });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Should Not Be Created',
        email: `forbidden-${suffix}@example.com`,
        password: 'password-123',
        role: 'OWNER',
        societyId,
      });
    expect(res.status).toBe(403);
  });

  it('creates a user with a bcrypt-hashed (not plaintext) password, given a valid admin token', async () => {
    const email = `owner-${suffix}@example.com`;
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Owner',
        email,
        phone: `+91900000${suffix.slice(-4)}`,
        password: 'plaintext-password-123',
        role: 'OWNER',
        societyId,
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('passwordHash');
    createdUserIds.push(res.body.id);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.passwordHash).not.toBe('plaintext-password-123');
    expect(await bcrypt.compare('plaintext-password-123', stored.passwordHash)).toBe(true);
  });

  it('rejects a duplicate email without creating a second row', async () => {
    const email = `dup-${suffix}@example.com`;
    const first = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'First User',
        email,
        password: 'password-123',
        role: 'OWNER',
        societyId,
      });
    expect(first.status).toBe(201);
    createdUserIds.push(first.body.id);

    const second = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Second User',
        email,
        password: 'password-456',
        role: 'TENANT',
        societyId,
      });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('email');

    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(1);
  });

  it('rejects a duplicate phone without creating a second row', async () => {
    const phone = `+91900001${suffix.slice(-4)}`;
    const first = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'First Phone User',
        email: `phone-a-${suffix}@example.com`,
        phone,
        password: 'password-123',
        role: 'OWNER',
        societyId,
      });
    expect(first.status).toBe(201);
    createdUserIds.push(first.body.id);

    const second = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Second Phone User',
        email: `phone-b-${suffix}@example.com`,
        phone,
        password: 'password-456',
        role: 'TENANT',
        societyId,
      });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('phone');

    const count = await prisma.user.count({ where: { phone } });
    expect(count).toBe(1);
  });

  it('rejects invalid input with a 400', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '',
        email: 'not-an-email',
        password: 'short',
        role: 'OWNER',
        societyId,
      });
    expect(res.status).toBe(400);
  });
});
