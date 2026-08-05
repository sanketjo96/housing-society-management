import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Role } from '../generated/prisma/client';
import { prisma } from '../db';

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
