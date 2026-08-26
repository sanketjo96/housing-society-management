// Owns Meta Cloud API HTTP details only — plain fetch. Only this file knows Meta's
// request/response shape.
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
    // Meta was never reached — retry-eligible, not a permanent rejection.
    throw new WhatsAppTransientError(
      `WhatsApp API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = (await response.json().catch(() => ({}))) as MetaErrorBody & MetaSuccessBody;

  if (!response.ok) {
    const message = body.error?.message ?? `WhatsApp API responded with HTTP ${response.status}`;
    // 429/5xx are worth retrying; everything else is a permanent rejection.
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
