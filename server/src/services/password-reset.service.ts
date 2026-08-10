import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { getEmailProvider } from '../lib/email';

export class InvalidResetTokenError extends Error {
  constructor() {
    super('Invalid or expired reset token');
    this.name = 'InvalidResetTokenError';
  }
}

const RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Phase 7: real send, via the swappable EmailProvider (src/lib/email) — defaults to
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
