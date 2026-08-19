// Owns Meta Cloud API HTTP details only — plain fetch, same shape as
// resend-email-provider.ts's HTTP call (architecture.md §4). Only this file should
// know Meta's request/response shape; whatsapp.service.ts calls this and never talks
// to Meta directly.
import { getWhatsAppConfig } from './whatsapp.config';
import {
  SendWhatsAppTemplateInput,
  SendWhatsAppTemplateResult,
  WhatsAppPermanentError,
  WhatsAppTransientError,
} from './whatsapp.types';

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

interface MetaSuccessBody {
  messages?: Array<{ id?: string }>;
}

export async function sendWhatsAppTemplate(
  input: SendWhatsAppTemplateInput,
): Promise<SendWhatsAppTemplateResult> {
  const config = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: input.template.name,
          language: { code: input.template.languageCode },
          components: input.template.components,
        },
      }),
    });
  } catch (err) {
    // Network failure (DNS, timeout, connection reset) — Meta was never actually
    // reached, so this is retry-eligible, not a permanent rejection.
    throw new WhatsAppTransientError(
      `WhatsApp API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = (await response.json().catch(() => ({}))) as MetaErrorBody & MetaSuccessBody;

  if (!response.ok) {
    const message = body.error?.message ?? `WhatsApp API responded with HTTP ${response.status}`;
    // 429 (rate limited) and 5xx (Meta-side outage) are worth retrying; everything
    // else (400/401/403/404/410 — bad template, unapproved template, invalid/rejected
    // phone number, bad credentials) is a permanent rejection of this exact message —
    // retrying it would just fail again the same way (architecture.md §6).
    if (response.status === 429 || response.status >= 500) {
      throw new WhatsAppTransientError(message);
    }
    throw new WhatsAppPermanentError(message);
  }

  const providerMessageId = body.messages?.[0]?.id;
  if (!providerMessageId) {
    throw new WhatsAppPermanentError('WhatsApp API accepted the request but returned no message id');
  }

  return { providerMessageId };
}
