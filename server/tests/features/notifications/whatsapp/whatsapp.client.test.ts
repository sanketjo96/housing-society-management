import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendWhatsAppTemplate } from '../../../../src/features/notifications/whatsapp/whatsapp.client';
import {
  WhatsAppPermanentError,
  WhatsAppTransientError,
} from '../../../../src/features/notifications/whatsapp/whatsapp.types';

const TEMPLATE = {
  to: '+919876543210',
  template: {
    name: 'maintenance_bill_generated',
    languageCode: 'en',
    components: [{ type: 'body' as const, parameters: [{ type: 'text' as const, text: 'August 2026' }] }],
  },
};

function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('sendWhatsAppTemplate', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'secret-token-value';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_API_VERSION = 'v21.0';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns the provider message id on success', async () => {
    mockFetchOnce(200, { messages: [{ id: 'wamid.abc123' }] });

    const result = await sendWhatsAppTemplate(TEMPLATE);

    expect(result.providerMessageId).toBe('wamid.abc123');
  });

  it('never logs the access token', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetchOnce(200, { messages: [{ id: 'wamid.abc123' }] });

    await sendWhatsAppTemplate(TEMPLATE);

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allLoggedText).not.toContain('secret-token-value');
  });

  it('throws WhatsAppTransientError on a 429 rate-limit response', async () => {
    mockFetchOnce(429, { error: { message: 'Too many requests' } });
    await expect(sendWhatsAppTemplate(TEMPLATE)).rejects.toThrow(WhatsAppTransientError);
  });

  it('throws WhatsAppTransientError on a 5xx Meta-side error', async () => {
    mockFetchOnce(503, { error: { message: 'Service unavailable' } });
    await expect(sendWhatsAppTemplate(TEMPLATE)).rejects.toThrow(WhatsAppTransientError);
  });

  it('throws WhatsAppPermanentError on a 400 (e.g. unapproved template / bad number)', async () => {
    mockFetchOnce(400, { error: { message: 'Template not approved' } });
    await expect(sendWhatsAppTemplate(TEMPLATE)).rejects.toThrow(WhatsAppPermanentError);
  });

  it('throws WhatsAppTransientError on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(sendWhatsAppTemplate(TEMPLATE)).rejects.toThrow(WhatsAppTransientError);
  });
});
