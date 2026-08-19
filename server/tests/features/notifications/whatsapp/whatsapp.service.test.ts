import { describe, expect, it } from 'vitest';
import { normalizePhoneToE164 } from '../../../../src/features/notifications/whatsapp/whatsapp.service';
import { WhatsAppPermanentError } from '../../../../src/features/notifications/whatsapp/whatsapp.types';

describe('normalizePhoneToE164', () => {
  it('prefixes a bare 10-digit Indian mobile number with +91', () => {
    expect(normalizePhoneToE164('9876543210')).toBe('+919876543210');
  });

  it('strips spaces/hyphens before normalizing', () => {
    expect(normalizePhoneToE164('98765-43210')).toBe('+919876543210');
    expect(normalizePhoneToE164('98765 43210')).toBe('+919876543210');
  });

  it('strips a leading trunk zero', () => {
    expect(normalizePhoneToE164('09876543210')).toBe('+919876543210');
  });

  it('accepts a 12-digit number already carrying the 91 country code', () => {
    expect(normalizePhoneToE164('919876543210')).toBe('+919876543210');
  });

  it('passes through an already-E.164 value unchanged', () => {
    expect(normalizePhoneToE164('+919876543210')).toBe('+919876543210');
  });

  it('throws WhatsAppPermanentError for an unparseable number', () => {
    expect(() => normalizePhoneToE164('12345')).toThrow(WhatsAppPermanentError);
  });
});
