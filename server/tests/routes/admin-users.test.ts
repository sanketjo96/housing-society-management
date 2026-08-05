import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';

describe('POST /admin/users', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('creates a user with a bcrypt-hashed (not plaintext) password', async () => {
    const email = `owner-${suffix}@example.com`;
    const res = await request(app).post('/api/admin/users').send({
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
    const first = await request(app).post('/api/admin/users').send({
      name: 'First User',
      email,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    expect(first.status).toBe(201);
    createdUserIds.push(first.body.id);

    const second = await request(app).post('/api/admin/users').send({
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
    const first = await request(app).post('/api/admin/users').send({
      name: 'First Phone User',
      email: `phone-a-${suffix}@example.com`,
      phone,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    expect(first.status).toBe(201);
    createdUserIds.push(first.body.id);

    const second = await request(app).post('/api/admin/users').send({
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
    const res = await request(app).post('/api/admin/users').send({
      name: '',
      email: 'not-an-email',
      password: 'short',
      role: 'OWNER',
      societyId,
    });
    expect(res.status).toBe(400);
  });
});
