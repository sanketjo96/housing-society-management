import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DuplicateFieldError } from '../../../src/shared/errors/errors';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin-users.service';
import { updateOwnProfile } from '../../../src/features/users/profile.service';

describe('profile service — updateOwnProfile', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let userId: string;
  let otherEmail: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Test Society ${suffix}`, address: '1 Test St', upiVpa: 'test@okhdfcbank' },
    });
    societyId = society.id;

    const user = await createUser({
      name: 'Original Name',
      email: `me-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(user.id);
    userId = user.id;

    const other = await createUser({
      name: 'Other User',
      email: `me-other-${suffix}@example.com`,
      password: 'password-123',
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(other.id);
    otherEmail = other.email;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('updates the caller’s own name/phone/email', async () => {
    const updated = await updateOwnProfile(userId, { name: 'New Name', phone: '+919000000001' });
    expect(updated.name).toBe('New Name');
    expect(updated.phone).toBe('+919000000001');
    expect(updated).not.toHaveProperty('passwordHash');
  });

  it('throws DuplicateFieldError when the new email is already in use', async () => {
    await expect(updateOwnProfile(userId, { email: otherEmail })).rejects.toBeInstanceOf(
      DuplicateFieldError,
    );
  });
});
