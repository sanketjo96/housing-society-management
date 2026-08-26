import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Role } from '../../infrastructure/prisma/generated/client';
import { prisma } from '../../infrastructure/prisma/client';
import { getEmailProvider } from '../../infrastructure/email';

// --- Session (login / refresh / logout / me) ---

export class InvalidCredentialsError extends Error {
  constructor() {
    // Deliberately generic — same error for "no such user" and "wrong password" so
    // the API response can't be used to enumerate which emails have accounts.
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid or expired refresh token');
    this.name = 'InvalidRefreshTokenError';
  }
}

export interface LoginInput {
  email: string;
  password: string;
}

const ACCESS_TOKEN_TTL = '15m';
// Exported so the controller derives the cookie's maxAge from this, not a second hardcoded value.
export const REFRESH_TOKEN_TTL_DAYS = 7;

function signAccessToken(user: { id: string; role: Role; societyId: string }): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set');
  }
  return jwt.sign({ sub: user.id, role: user.role, societyId: user.societyId }, secret, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

// Refresh tokens are opaque random values, not JWTs. SHA-256, not bcrypt, is fine
// here since the input is already high-entropy (32 random bytes).
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  return token;
}

export async function login({ email, password }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new InvalidCredentialsError();
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      societyId: user.societyId,
    },
  };
}

// Fetches the current user's profile — called after /refresh to populate the
// frontend's auth context, since refresh itself only returns a token.
export async function getCurrentUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, societyId: true },
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new InvalidRefreshTokenError();
  }

  return { accessToken: signAccessToken(stored.user) };
}

// Logging out an already-invalid token is a no-op, not an error.
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt) {
    return;
  }

  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}

// --- Password reset ---

export class InvalidResetTokenError extends Error {
  constructor() {
    super('Invalid or expired reset token');
    this.name = 'InvalidResetTokenError';
  }
}

const RESET_TOKEN_TTL_MINUTES = 10;

// Builds the reset link: APP_BASE_URL + the client's /reset-password route,
// which reads ?token= off the query string.
function buildResetUrl(token: string): string {
  const base = (process.env.APP_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
  return `${base}/reset-password?token=${token}`;
}

async function sendResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = buildResetUrl(token);
  await getEmailProvider().send({
    to: email,
    subject: 'Reset your password',
    text:
      `We received a request to reset your password. This link expires in ` +
      `${RESET_TOKEN_TTL_MINUTES} minutes:\n\n${resetUrl}\n\n` +
      `If you didn't request this, you can ignore this email.`,
    html:
      `<p>We received a request to reset your password. This link expires in ` +
      `${RESET_TOKEN_TTL_MINUTES} minutes:</p><p><a href="${resetUrl}">${resetUrl}</a></p>` +
      `<p>If you didn't request this, you can ignore this email.</p>`,
  });
}

// Returns null for an unknown email — the controller responds identically either
// way, so this can't be used to enumerate accounts.
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt },
  });

  await sendResetEmail(email, token);

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new InvalidResetTokenError();
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    }),
    // Revoke every existing session so old refresh tokens can't outlive the new password.
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
