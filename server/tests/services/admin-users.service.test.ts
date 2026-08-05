import bcrypt from 'bcrypt';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { createUser, DuplicateFieldError } from '../../src/services/admin-users.service';

// Unlike tests/routes/admin-users.test.ts, this calls the service directly — no HTTP,
// no supertest. This is the concrete payoff of the route/controller/service split:
// business logic is testable in isolation.
describe('createUser service', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('hashes the password and returns the user without it', async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '123 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Service Test User',
      email: `service-${suffix}@example.com`,
      password: 'plaintext-password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(user.id);

    expect(user).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare('plaintext-password-123', stored.passwordHash)).toBe(true);
  });

  it('throws DuplicateFieldError naming the field, not a generic Prisma error', async () => {
    const email = `dup-service-${suffix}@example.com`;
    const first = await createUser({
      name: 'First',
      email,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(first.id);

    await expect(
      createUser({ name: 'Second', email, password: 'password-456', role: 'TENANT', societyId }),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof DuplicateFieldError && err.fields.includes('email');
    });
  });
});
