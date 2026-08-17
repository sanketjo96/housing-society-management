import { afterEach, describe, expect, it } from 'vitest';
import { ConsoleEmailProvider } from '../../../src/infrastructure/email/console-email-provider';
import { getEmailProvider } from '../../../src/infrastructure/email/index';
import { ResendEmailProvider } from '../../../src/infrastructure/email/resend-email-provider';

describe('getEmailProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to ConsoleEmailProvider when EMAIL_PROVIDER is unset', () => {
    delete process.env.EMAIL_PROVIDER;
    expect(getEmailProvider()).toBeInstanceOf(ConsoleEmailProvider);
  });

  it('returns a ResendEmailProvider when EMAIL_PROVIDER=resend and credentials are set', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Housing Society <noreply@example.com>';
    expect(getEmailProvider()).toBeInstanceOf(ResendEmailProvider);
  });

  it('throws when EMAIL_PROVIDER=resend but RESEND_API_KEY is missing', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'Housing Society <noreply@example.com>';
    expect(() => getEmailProvider()).toThrow(/RESEND_API_KEY/);
  });

  it('throws when EMAIL_PROVIDER=resend but EMAIL_FROM is missing', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'test-key';
    delete process.env.EMAIL_FROM;
    expect(() => getEmailProvider()).toThrow(/EMAIL_FROM/);
  });

  it('throws for an unrecognized EMAIL_PROVIDER value', () => {
    process.env.EMAIL_PROVIDER = 'carrier-pigeon';
    expect(() => getEmailProvider()).toThrow(/Unknown EMAIL_PROVIDER/);
  });
});
