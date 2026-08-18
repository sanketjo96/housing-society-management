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
// Exported so the controller can set the httpOnly cookie's maxAge from the same
// source of truth, rather than a second hardcoded 7 that could silently drift from
// this one.
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

// Refresh tokens are opaque random values, not JWTs — see the RefreshToken model's
// schema comment for why. hashToken uses a fast cryptographic hash (not bcrypt):
// appropriate because the token itself is already high-entropy (32 random bytes), not
// a low-entropy user-chosen secret that needs deliberately slow hashing against
// brute force.
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

// "Who am I" for the frontend's silent-session-restore flow (Task 2.8): /api/auth/refresh
// only returns a fresh access token, not the user — the frontend calls this
// immediately afterward (with that new token) to get the full profile needed to
// populate the auth context on page load, without asking the user to log in again.
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

// Idempotent by design: logging out an already-invalid (unknown, expired, or already
// revoked) token is a no-op, not an error — the caller's intent ("I want to not be
// logged in") is already satisfied either way, and there's no reason to leak whether
// a given token was ever valid.
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

// Phase 7: real send, via the swappable EmailProvider (src/infrastructure/email) — defaults to
// ConsoleEmailProvider (logs instead of sending) unless EMAIL_PROVIDER=resend is set,
// so dev/test never need a real RESEND_API_KEY. Builds the link the resident actually
// clicks: APP_BASE_URL + the client's /reset-password route (ResetPasswordPage.tsx),
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

// Returns null (not an error) for an email that doesn't exist — the controller
// responds identically either way, so the API can't be used to enumerate accounts.
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
    // A password reset is a reasonable signal the account may have been compromised
    // (or the user simply forgot it and wants a clean slate) — revoke every existing
    // session rather than leaving old refresh tokens usable with the new password.
    // Not an explicit requirement of this task, but a natural extension of why
    // RefreshToken exists at all (Task 2.3): revocation only matters if it's actually
    // triggered when it should be.
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
